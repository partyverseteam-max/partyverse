import { APP_CONFIG, isConfigReady, isTurnstileConfigured } from "./config.js";
import { supabase } from "./supabaseClient.js";

const elConfig = document.getElementById("status-config");
const elClient = document.getElementById("status-client");
const elTurnstile = document.getElementById("status-turnstile");
const elAuth = document.getElementById("status-auth");
const btnSignIn = document.getElementById("btn-signin");
const btnSignOut = document.getElementById("btn-signout");
const logOutput = document.getElementById("log-output");

let captchaToken = null;
let turnstileWidgetId = null;

function setBadge(el, text, state = "") {
  el.textContent = text;
  el.className = state ? `badge ${state}` : "badge";
}

function log(message) {
  logOutput.textContent = message;
}

function updateSignInButton() {
  if (!supabase) {
    btnSignIn.disabled = true;
    return;
  }
  btnSignIn.disabled = isTurnstileConfigured() && !captchaToken;
}

function showSession(session) {
  if (session?.user) {
    const shortId = `${session.user.id.slice(0, 8)}...`;
    setBadge(elAuth, `Active (${shortId})`, "ok");
    btnSignIn.hidden = true;
    btnSignOut.hidden = false;
    log(
      `Signed in anonymously!\n` +
        `User ID: ${session.user.id}\n` +
        `is_anonymous: ${session.user.is_anonymous}\n\n` +
        `Refresh this page now — if the same User ID stays active, session persistence works.`
    );
  } else {
    setBadge(elAuth, "Not signed in");
    btnSignIn.hidden = false;
    btnSignOut.hidden = true;
    updateSignInButton();
  }
}

function initTurnstile() {
  if (!isTurnstileConfigured()) {
    setBadge(elTurnstile, "Not configured", "warn");
    updateSignInButton();
    return;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (window.turnstile) {
      clearInterval(timer);
      turnstileWidgetId = window.turnstile.render("#turnstile-box", {
        sitekey: APP_CONFIG.TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (token) => {
          captchaToken = token;
          setBadge(elTurnstile, "Verified", "ok");
          updateSignInButton();
        },
        "expired-callback": () => {
          captchaToken = null;
          setBadge(elTurnstile, "Expired — retry", "warn");
          updateSignInButton();
        },
        "error-callback": () => {
          captchaToken = null;
          setBadge(elTurnstile, "Widget error", "err");
          updateSignInButton();
        },
      });
    } else if (attempts > 40) {
      clearInterval(timer);
      setBadge(elTurnstile, "Script blocked", "err");
    }
  }, 150);
}

btnSignIn.addEventListener("click", async () => {
  if (!supabase) return;

  btnSignIn.disabled = true;
  log("Signing in anonymously...");

  const payload = captchaToken ? { options: { captchaToken } } : undefined;
  const { data, error } = await supabase.auth.signInAnonymously(payload);

  if (window.turnstile && turnstileWidgetId !== null) {
    captchaToken = null;
    window.turnstile.reset(turnstileWidgetId);
    setBadge(elTurnstile, "Resetting...", "warn");
  }

  if (error) {
    setBadge(elAuth, "Failed", "err");
    log(`Anonymous Sign-In error:\n${error.message}`);
    updateSignInButton();
    return;
  }

  showSession(data.session);
});

btnSignOut.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  log("Signed out. You can test a fresh Anonymous Sign-In.");
  showSession(null);
});

async function boot() {
  if (!isConfigReady()) {
    setBadge(elConfig, "Missing keys", "err");
    setBadge(elClient, "Skipped", "warn");
    log("Open js/config.js and paste your Supabase URL and public key.");
    return;
  }

  setBadge(elConfig, "Loaded", "ok");
  setBadge(elClient, "Ready", "ok");

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setBadge(elAuth, "Session error", "err");
    log(`Session check failed:\n${error.message}`);
  } else {
    showSession(data.session);
  }

  initTurnstile();
}

boot();
