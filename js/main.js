import { APP_CONFIG, isConfigReady, isTurnstileConfigured } from "./config.js";
import { supabase } from "./supabaseClient.js";
import {
  ALLOWED_AVATARS,
  getOrCreateMyProfile,
  updateMyProfile,
  generateRecoveryPin,
  recoverProfileWithPin,
} from "./profile.js";

// Splash Element
const elAppSplash = document.getElementById("app-splash");

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

// Adaptive Navigation Elements (Mobile Bottom Nav + Desktop Sidebar)
const navButtons = document.querySelectorAll("[data-view]");
const views = document.querySelectorAll(".view");

// Profile Elements
const elAvatarPreview = document.getElementById("profile-avatar-preview");
const elDisplayName = document.getElementById("profile-display-name");
const elProfileSyncNote = document.getElementById("profile-sync-note");
const elPlayerCode = document.getElementById("profile-player-code");
const btnCopyCode = document.getElementById("btn-copy-code");
const inputNickname = document.getElementById("input-nickname");
const elAvatarGrid = document.getElementById("avatar-grid");
const avatarOptions = document.querySelectorAll(".avatar-option[data-avatar]");
const btnSaveProfile = document.getElementById("btn-save-profile");
const elProfileFeedback = document.getElementById("profile-feedback");

// Recovery PIN Elements
const elPinStatusPill = document.getElementById("pin-status-pill");
const elPinDesc = document.getElementById("pin-desc");
const elPinSlots = document.getElementById("pin-slots");
const elPinReveal = document.getElementById("pin-reveal");
const elRevealPlayerCode = document.getElementById("reveal-player-code");
const elRevealPinCode = document.getElementById("reveal-pin-code");
const btnCopyRecovery = document.getElementById("btn-copy-recovery");
const btnDismissPin = document.getElementById("btn-dismiss-pin");
const btnGeneratePin = document.getElementById("btn-generate-pin");
const elPinFeedback = document.getElementById("pin-feedback");

// Recover Existing Profile Elements
const elRecoverDetails = document.getElementById("recover-details");
const inputRecoverCode = document.getElementById("input-recover-code");
const inputRecoverPin = document.getElementById("input-recover-pin");
const btnRecoverProfile = document.getElementById("btn-recover-profile");
const elRecoverFeedback = document.getElementById("recover-feedback");

// Auth State
let captchaToken = null;
let turnstileWidgetId = null;
let turnstileBooting = false;
let activeSession = null;

// Profile State (In-Memory Only — Plaintext PIN Is Never Persisted or Logged)
let currentProfile = null;
let selectedAvatar = "🦊";
let revealedRecovery = null;

/* --------------------------------------------------------------------------
   Splash & UI Helpers
   -------------------------------------------------------------------------- */

function hideSplash() {
  if (!elAppSplash || elAppSplash.hidden) return;
  elAppSplash.classList.add("is-hidden");
  setTimeout(() => {
    elAppSplash.hidden = true;
  }, 240);
}

function setSessionStatus(label, tone = "") {
  if (elStatusAuth) elStatusAuth.textContent = label;
  if (elProfileSessionStatus) elProfileSessionStatus.textContent = label;
  if (elStatusPill) {
    elStatusPill.className = tone
      ? `status-pill status-pill--${tone}`
      : "status-pill";
  }
}

function setAuthFeedback(message, isError = false) {
  if (!elLogOutput) return;
  elLogOutput.textContent = message;
  elLogOutput.className = isError
    ? "auth-feedback auth-feedback--error"
    : "auth-feedback";
}

function setInlineFeedback(el, message, tone = "") {
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.className = "inline-feedback";
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.className = tone
    ? `inline-feedback inline-feedback--${tone}`
    : "inline-feedback";
  el.hidden = false;
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

function updateSignInButton() {
  if (!btnSignIn) return;
  if (!supabase) {
    btnSignIn.disabled = true;
    return;
  }
  btnSignIn.disabled = isTurnstileConfigured() && !captchaToken;
}

function setAvatarSelection(avatar) {
  const validAvatar = ALLOWED_AVATARS.includes(avatar) ? avatar : "🦊";
  selectedAvatar = validAvatar;

  if (elAvatarPreview) elAvatarPreview.textContent = validAvatar;
  avatarOptions.forEach((btn) => {
    const isSelected = btn.dataset.avatar === validAvatar;
    btn.classList.toggle("is-selected", isSelected);
    btn.setAttribute("aria-pressed", String(isSelected));
  });
}

function clearRevealedPin() {
  revealedRecovery = null;
  if (elRevealPlayerCode) elRevealPlayerCode.textContent = "------";
  if (elRevealPinCode) elRevealPinCode.textContent = "--------";
  if (elPinReveal) elPinReveal.hidden = true;
  if (elPinSlots) elPinSlots.hidden = false;
}

function renderPinSection(profile) {
  const hasPin = Boolean(profile?.has_recovery_pin);

  if (elPinStatusPill) {
    elPinStatusPill.textContent = hasPin ? "Active" : "Not Set";
    elPinStatusPill.className = hasPin
      ? "pill pill--available"
      : "pill pill--upcoming";
  }

  if (elPinDesc) {
    if (hasPin) {
      const updated = formatDateTime(profile.pin_set_at);
      elPinDesc.textContent = updated
        ? `Recovery PIN is active (last updated ${updated}). For your security, it cannot be viewed again. Rotating immediately replaces your old PIN.`
        : "Recovery PIN is active. For your security, it cannot be viewed again. Rotating immediately replaces your old PIN.";
    } else {
      elPinDesc.textContent =
        "Generate a one-time 8-digit PIN to restore your profile on another device using your Player Code. PINs are hashed server-side and cannot be viewed again.";
    }
  }

  if (btnGeneratePin) {
    btnGeneratePin.disabled = !profile;
    btnGeneratePin.textContent = hasPin
      ? "Rotate Recovery PIN"
      : "Generate Recovery PIN";
  }

  if (elPinSlots) {
    const slots = elPinSlots.querySelectorAll(".pin-slot");
    slots.forEach((slot) => {
      slot.textContent = hasPin ? "•" : "–";
    });
  }
}

function renderProfile(profile) {
  currentProfile = profile;

  if (!profile) {
    if (elDisplayName) elDisplayName.textContent = "Guest Player";
    if (elProfileSyncNote) {
      elProfileSyncNote.textContent = "Sign in as a guest to load your profile.";
    }
    if (elPlayerCode) elPlayerCode.textContent = "------";
    if (btnCopyCode) btnCopyCode.disabled = true;
    if (inputNickname) {
      inputNickname.value = "";
      inputNickname.disabled = true;
    }
    setAvatarSelection("🦊");
    if (btnSaveProfile) btnSaveProfile.disabled = true;
    if (btnRecoverProfile) btnRecoverProfile.disabled = true;
    clearRevealedPin();
    renderPinSection(null);
    return;
  }

  if (elDisplayName) elDisplayName.textContent = profile.nickname;
  if (elProfileSyncNote) {
    elProfileSyncNote.textContent = profile.is_customized
      ? "Saved to your PartyVerse profile."
      : "Default guest profile — customize and save below.";
  }
  if (elPlayerCode) elPlayerCode.textContent = profile.player_code;
  if (btnCopyCode) btnCopyCode.disabled = false;
  if (inputNickname) {
    inputNickname.value = profile.nickname;
    inputNickname.disabled = false;
  }
  setAvatarSelection(profile.avatar);
  if (btnSaveProfile) btnSaveProfile.disabled = false;
  if (btnRecoverProfile) btnRecoverProfile.disabled = false;

  renderPinSection(profile);
}

/* --------------------------------------------------------------------------
   Navigation (Instant View Switching — Synced Mobile Bottom Nav & Sidebar)
   -------------------------------------------------------------------------- */

function switchView(viewName) {
  views.forEach((section) => {
    section.classList.toggle("is-active", section.id === `view-${viewName}`);
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
   Profile Loading, Saving, PIN Generation & Recovery
   -------------------------------------------------------------------------- */

async function loadMyProfile() {
  if (!activeSession?.user) {
    renderProfile(null);
    return;
  }

  if (elProfileSyncNote) elProfileSyncNote.textContent = "Loading profile...";
  setInlineFeedback(elProfileFeedback, "");

  try {
    const profile = await getOrCreateMyProfile();
    renderProfile(profile);
  } catch (err) {
    if (elProfileSyncNote) {
      elProfileSyncNote.textContent = "Could not load profile.";
    }
    setInlineFeedback(
      elProfileFeedback,
      err.message || "Could not load your profile. Refresh to retry.",
      "error"
    );
  }
}

function initProfileControls() {
  if (inputNickname && elDisplayName) {
    inputNickname.addEventListener("input", () => {
      const preview = inputNickname.value.trim();
      elDisplayName.textContent = preview || "Guest Player";
    });
  }

  if (elAvatarGrid) {
    elAvatarGrid.addEventListener("click", (event) => {
      if (!currentProfile) return;
      const option = event.target.closest(".avatar-option[data-avatar]");
      if (!option) return;
      setAvatarSelection(option.dataset.avatar);
    });
  }

  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", async () => {
      if (!currentProfile?.player_code) return;
      try {
        await navigator.clipboard.writeText(currentProfile.player_code);
        btnCopyCode.textContent = "Copied!";
        setTimeout(() => {
          btnCopyCode.textContent = "Copy Code";
        }, 1800);
      } catch {
        setInlineFeedback(
          elProfileFeedback,
          `Your Player Code is ${currentProfile.player_code}.`,
          "ok"
        );
      }
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener("click", async () => {
      if (!currentProfile || !inputNickname) return;

      btnSaveProfile.disabled = true;
      btnSaveProfile.textContent = "Saving...";
      setInlineFeedback(elProfileFeedback, "");

      try {
        const updated = await updateMyProfile(inputNickname.value, selectedAvatar);
        renderProfile(updated);
        setInlineFeedback(elProfileFeedback, "Profile saved.", "ok");
      } catch (err) {
        setInlineFeedback(
          elProfileFeedback,
          err.message || "Could not save profile.",
          "error"
        );
      } finally {
        btnSaveProfile.disabled = !currentProfile;
        btnSaveProfile.textContent = "Save Profile";
      }
    });
  }

  if (btnGeneratePin) {
    btnGeneratePin.addEventListener("click", async () => {
      if (!currentProfile) return;

      const isRotating = Boolean(currentProfile.has_recovery_pin);
      btnGeneratePin.disabled = true;
      btnGeneratePin.textContent = isRotating ? "Rotating..." : "Generating...";
      setInlineFeedback(elPinFeedback, "");

      try {
        const result = await generateRecoveryPin();
        revealedRecovery = {
          playerCode: result.player_code,
          pin: result.recovery_pin,
        };

        currentProfile = {
          ...currentProfile,
          has_recovery_pin: true,
          pin_set_at: result.pin_set_at,
        };
        renderPinSection(currentProfile);

        if (elRevealPlayerCode) {
          elRevealPlayerCode.textContent = revealedRecovery.playerCode;
        }
        if (elRevealPinCode) {
          elRevealPinCode.textContent = revealedRecovery.pin;
        }
        if (elPinSlots) elPinSlots.hidden = true;
        if (elPinReveal) elPinReveal.hidden = false;

        setInlineFeedback(
          elPinFeedback,
          isRotating
            ? "New Recovery PIN generated. Your previous PIN no longer works."
            : "Recovery PIN generated. Save it now — it will not be shown again.",
          "ok"
        );
      } catch (err) {
        setInlineFeedback(
          elPinFeedback,
          err.message || "Could not generate Recovery PIN.",
          "error"
        );
        renderPinSection(currentProfile);
      }
    });
  }

  if (btnCopyRecovery) {
    btnCopyRecovery.addEventListener("click", async () => {
      if (!revealedRecovery) return;
      const text = `PartyVerse Recovery\nPlayer Code: ${revealedRecovery.playerCode}\nRecovery PIN: ${revealedRecovery.pin}`;
      try {
        await navigator.clipboard.writeText(text);
        btnCopyRecovery.textContent = "Copied!";
        setTimeout(() => {
          btnCopyRecovery.textContent = "Copy Code & PIN";
        }, 1800);
      } catch {
        setInlineFeedback(
          elPinFeedback,
          "Clipboard access blocked — please copy the code and PIN manually.",
          "warn"
        );
      }
    });
  }

  if (btnDismissPin) {
    btnDismissPin.addEventListener("click", () => {
      clearRevealedPin();
      setInlineFeedback(elPinFeedback, "");
    });
  }

  if (btnRecoverProfile) {
    btnRecoverProfile.addEventListener("click", async () => {
      if (!activeSession?.user || !inputRecoverCode || !inputRecoverPin) return;

      const codeVal = inputRecoverCode.value;
      const pinVal = inputRecoverPin.value;

      btnRecoverProfile.disabled = true;
      btnRecoverProfile.textContent = "Recovering...";
      setInlineFeedback(elRecoverFeedback, "");

      try {
        const result = await recoverProfileWithPin(codeVal, pinVal);
        inputRecoverPin.value = "";

        if (result?.ok && result.profile) {
          clearRevealedPin();
          inputRecoverCode.value = "";
          renderProfile(result.profile);
          setInlineFeedback(
            elProfileFeedback,
            result.message || "Profile recovered. Generate a new Recovery PIN if needed.",
            "ok"
          );
          setInlineFeedback(elRecoverFeedback, "");
          if (elRecoverDetails) elRecoverDetails.open = false;
        } else {
          const tone =
            result?.code === "CURRENT_PROFILE_NOT_PRISTINE" ||
            result?.code === "ALREADY_OWNED"
              ? "warn"
              : "error";
          setInlineFeedback(
            elRecoverFeedback,
            result?.message || "Recovery failed. Check your details or try again later.",
            tone
          );
        }
      } catch (err) {
        inputRecoverPin.value = "";
        setInlineFeedback(
          elRecoverFeedback,
          err.message || "Recovery request failed. Please try again.",
          "error"
        );
      } finally {
        btnRecoverProfile.disabled = !activeSession?.user;
        btnRecoverProfile.textContent = "Recover Profile";
      }
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
  activeSession = session?.user ? session : null;

  if (activeSession) {
    setSessionStatus("Guest Session Active", "active");
    if (elAuthCard) elAuthCard.hidden = true;
    if (btnSignOut) btnSignOut.hidden = false;
    setAuthFeedback("Guest session active.");
    loadMyProfile();
  } else {
    setSessionStatus("Not Signed In", "warn");
    if (elAuthCard) elAuthCard.hidden = false;
    if (btnSignOut) btnSignOut.hidden = true;
    setAuthFeedback("Complete verification above, then tap Continue as Guest.");
    setInlineFeedback(elProfileFeedback, "");
    setInlineFeedback(elPinFeedback, "");
    setInlineFeedback(elRecoverFeedback, "");
    renderProfile(null);
    updateSignInButton();
    initTurnstile();
  }
}

if (btnSignIn) {
  btnSignIn.addEventListener("click", async () => {
    if (!supabase) return;

    btnSignIn.disabled = true;
    setAuthFeedback("Starting guest session...");

    const payload = captchaToken ? { options: { captchaToken } } : undefined;
    const { data, error } = await supabase.auth.signInAnonymously(payload);

    if (window.turnstile && turnstileWidgetId !== null) {
      captchaToken = null;
      window.turnstile.reset(turnstileWidgetId);
      if (elStatusTurnstile) elStatusTurnstile.textContent = "Resetting...";
    }

    if (error) {
      setSessionStatus("Sign-In Failed", "error");
      setAuthFeedback(`Could not start guest session:\n${error.message}`, true);
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
    clearRevealedPin();
    await supabase.auth.signOut();
    btnSignOut.disabled = false;
    showSession(null);
    setAuthFeedback("Signed out. Complete verification to start a new guest session.");
  });
}

/* --------------------------------------------------------------------------
   Startup
   -------------------------------------------------------------------------- */

async function boot() {
  initNavigation();
  initProfileControls();

  try {
    if (!isConfigReady() || !supabase) {
      setSessionStatus("Config Missing", "error");
      if (elAuthCard) elAuthCard.hidden = false;
      if (btnSignIn) btnSignIn.disabled = true;
      setAuthFeedback("Supabase configuration is missing in js/config.js.", true);
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setSessionStatus("Session Error", "error");
      if (elAuthCard) elAuthCard.hidden = false;
      setAuthFeedback(`Session check failed:\n${error.message}`, true);
      initTurnstile();
      return;
    }

    showSession(data.session);
  } finally {
    hideSplash();
  }
}

boot();
