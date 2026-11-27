import { APP_CONFIG, isConfigReady, isTurnstileConfigured } from "./config.js";
import { supabase } from "./supabaseClient.js";

// Top Bar & Session Elements
const elStatusPill = document.getElementById("status-pill");
const elStatusAuth = document.getElementById("status-auth");
const elProfileSessionStatus = document.getElementById("profile-session-status");

// Guest Sign-In & Turnstile Elements
const elAuthCard = document.getElementById("auth-card");
const elStatusTurnstile = document.getElementById("status-turnstile");
const btnSignIn = document.getElementById("btn-signin");
const btnSignOut = document.getElementById("btn-signout");
const elLogOutput = document.getElementById("log-output");

// Navigation Elements
const navButtons = document.querySelectorAll(".nav-btn[data-view]");
const views = document.querySelectorAll(".view");

// Profile UI-Only Preview Elements
const elAvatarPreview = document.getElementById("profile-avatar-preview");
const elDisplayName = document.getElementById("profile-display-name");
const inputNickname = document.getElementById("input-nickname");
const elAvatarGrid = document.getElementById("avatar-grid");
const avatarOptions = document.querySelectorAll(".avatar-option[data-avatar]");

let captchaToken = null;
let turnstileWidgetId = null;
let turnstileBooting = false;

/* --------------------------------------------------------------------------
   UI Helpers
   -------------------------------------------------------------------------- */

function setSessionStatus(label, tone = "") {
  if (elStatusAuth) {
    elStatusAuth.textContent = label;
  }
  if (elProfileSessionStatus) {
    elProfileSessionStatus.textContent = label;
  }
  if (elStatusPill) {
    elStatusPill.className = tone
      ? `status-pill status-pill--${tone}`
      : "status-pill";
  }
}

function setFeedback(message, isError = false) {
  if (!elLogOutput) return;
  elLogOutput.textContent = message;
  elLogOutput.className = isError
    ? "auth-feedback auth-feedback--error"
    : "auth-feedback";
}

function updateSignInButton() {
  if (!btnSignIn) return;
  if (!supabase) {
    btnSignIn.disabled = true;
    return;
  }
  btnSignIn.disabled = isTurnstileConfigured() && !captchaToken;
}

/* --------------------------------------------------------------------------
   Navigation (Instant View Switching — No Page Reload)
   -------------------------------------------------------------------------- */

function switchView(viewName) {
  views.forEach((section) => {
    const isMatch = section.id === `view-${viewName}`;
    section.classList.toggle("is-active", isMatch);
  });

  navButtons.forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle("is-active", isActive);
    if (isActive) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  });

  window.scrollTo({ top: 0 });
}

function initNavigation() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.view;
      if (target) switchView(target);
    });
  });
}

/* --------------------------------------------------------------------------
   Profile UI Preview (Local In-Memory Only — Not Saved Yet)
   -------------------------------------------------------------------------- */

function initProfilePreview() {
  if (inputNickname && elDisplayName) {
    inputNickname.addEventListener("input", () => {
      const cleaned = inputNickname.value.trim();
      elDisplayName.textContent = cleaned || "Guest Player";
    });
  }

  if (elAvatarGrid && elAvatarPreview) {
    elAvatarGrid.addEventListener("click", (event) => {
      const option = event.target.closest(".avatar-option[data-avatar]");
      if (!option) return;

      const selectedAvatar = option.dataset.avatar;
      elAvatarPreview.textContent = selectedAvatar;

      avatarOptions.forEach((btn) => {
        const isSelected = btn === option;
        btn.classList.toggle("is-selected", isSelected);
        btn.setAttribute("aria-pressed", String(isSelected));
      });
    });
  }
}

/* --------------------------------------------------------------------------
   Cloudflare Turnstile & Anonymous Authentication (Preserved from Phase 0)
   -------------------------------------------------------------------------- */

function initTurnstile() {
  if (!isTurnstileConfigured()) {
    if (elStatusTurnstile) elStatusTurnstile.textContent = "Not configured";
    updateSignInButton();
    return;
  }

  // If already rendered, just ensure it is ready for a fresh sign-in
  if (turnstileWidgetId !== null && window.turnstile) {
    if (!captchaToken) {
      window.turnstile.reset(turnstileWidgetId);
      if (elStatusTurnstile) elStatusTurnstile.textContent = "Waiting...";
    }
    return;
  }

  if (turnstileBooting) return;
  turnstileBooting = true;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (window.turnstile) {
      clearInterval(timer);
      turnstileBooting = false;

      turnstileWidgetId = window.turnstile.render("#turnstile-box", {
        sitekey: APP_CONFIG.TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (token) => {
          captchaToken = token;
          if (elStatusTurnstile) elStatusTurnstile.textContent = "Verified";
          updateSignInButton();
        },
        "expired-callback": () => {
          captchaToken = null;
          if (elStatusTurnstile) elStatusTurnstile.textContent = "Expired — retry";
          updateSignInButton();
        },
        "error-callback": () => {
          captchaToken = null;
          if (elStatusTurnstile) elStatusTurnstile.textContent = "Widget error";
          updateSignInButton();
        },
      });
    } else if (attempts > 40) {
      clearInterval(timer);
      turnstileBooting = false;
      if (elStatusTurnstile) elStatusTurnstile.textContent = "Script blocked";
    }
  }, 150);
}

function showSession(session) {
  if (session?.user) {
    setSessionStatus("Guest Session Active", "active");
    if (elAuthCard) elAuthCard.hidden = true;
    if (btnSignOut) btnSignOut.hidden = false;
    setFeedback("Guest session active.");
  } else {
    setSessionStatus("Not Signed In", "warn");
    if (elAuthCard) elAuthCard.hidden = false;
    if (btnSignOut) btnSignOut.hidden = true;
    setFeedback("Complete verification above, then tap Continue as Guest.");
    updateSignInButton();
    initTurnstile();
  }
}

if (btnSignIn) {
  btnSignIn.addEventListener("click", async () => {
    if (!supabase) return;

    btnSignIn.disabled = true;
    setFeedback("Starting guest session...");

    const payload = captchaToken ? { options: { captchaToken } } : undefined;
    const { data, error } = await supabase.auth.signInAnonymously(payload);

    if (window.turnstile && turnstileWidgetId !== null) {
      captchaToken = null;
      window.turnstile.reset(turnstileWidgetId);
      if (elStatusTurnstile) elStatusTurnstile.textContent = "Resetting...";
    }

    if (error) {
      setSessionStatus("Sign-In Failed", "error");
      setFeedback(`Could not start guest session:\n${error.message}`, true);
      updateSignInButton();
      return;
    }

    showSession(data.session);
  });
}

if (btnSignOut) {
  btnSignOut.addEventListener("click", async () => {
    if (!supabase) return;
    btnSignOut.disabled = true;
    await supabase.auth.signOut();
    btnSignOut.disabled = false;
    showSession(null);
    setFeedback("Signed out. Complete verification to start a new guest session.");
  });
}

/* --------------------------------------------------------------------------
   Startup
   -------------------------------------------------------------------------- */

async function boot() {
  initNavigation();
  initProfilePreview();

  if (!isConfigReady() || !supabase) {
    setSessionStatus("Config Missing", "error");
    if (elAuthCard) elAuthCard.hidden = false;
    if (btnSignIn) btnSignIn.disabled = true;
    setFeedback("Supabase configuration is missing in js/config.js.", true);
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setSessionStatus("Session Error", "error");
    if (elAuthCard) elAuthCard.hidden = false;
    setFeedback(`Session check failed:\n${error.message}`, true);
    initTurnstile();
    return;
  }

  showSession(data.session);
}

boot();
