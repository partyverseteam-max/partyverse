import { APP_CONFIG, isConfigReady, isTurnstileConfigured } from "./config.js";
import { supabase } from "./supabaseClient.js";
import {
  ALLOWED_AVATARS,
  getOrCreateMyProfile,
  updateMyProfile,
  generateRecoveryPin,
  recoverProfileWithPin,
} from "./profile.js";

// Safe no-op fallback so sound/FX can never block or break app startup
const noop = () => {};
let fx = {
  isSoundEnabled: () => false,
  toggleSound: () => false,
  playTap: noop,
  playTab: noop,
  playPop: noop,
  playCopy: noop,
  playSuccess: noop,
  playError: noop,
  playModalOpen: noop,
  playModalClose: noop,
  pulseElement: noop,
  burstSparks: noop,
  showToast: noop,
};

const SPLASH_FAILSAFE_MS = 4000;
const SESSION_CHECK_TIMEOUT_MS = 5000;

// Splash Element
const elAppSplash = document.getElementById("app-splash");

// Top Bar, Sound Toggle & Session Elements
const btnSoundToggle = document.getElementById("btn-sound-toggle");
const elSoundToggleIcon = document.getElementById("sound-toggle-icon");
const elSoundToggleLabel = document.getElementById("sound-toggle-label");
const elStatusPill = document.getElementById("status-pill");
const elStatusAuth = document.getElementById("status-auth");
const elProfileSessionStatus = document.getElementById("profile-session-status");

// Lobby Identity Strip Elements
const elLobbyAvatar = document.getElementById("lobby-player-avatar");
const elLobbyName = document.getElementById("lobby-player-name");

// Guest Sign-In & Turnstile Elements
const elAuthCard = document.getElementById("auth-card");
const elStatusTurnstile = document.getElementById("status-turnstile");
const btnSignIn = document.getElementById("btn-signin");
const btnSignOut = document.getElementById("btn-signout");
const elLogOutput = document.getElementById("log-output");

// Adaptive Navigation Elements (Mobile Bottom Nav + Desktop Sidebar)
const navButtons = document.querySelectorAll("[data-view]");
const jumpButtons = document.querySelectorAll("[data-jump-view]");
const views = document.querySelectorAll(".view");

// Game Details Modal Elements
const elGameModal = document.getElementById("game-detail-modal");
const elGameModalBadge = document.getElementById("game-detail-badge");
const elGameModalTitle = document.getElementById("game-detail-title");
const elGameModalSubtitle = document.getElementById("game-detail-subtitle");
const elGameModalDesc = document.getElementById("game-detail-desc");
const elGameModalTags = document.getElementById("game-detail-tags");
const elGameModalSteps = document.getElementById("game-detail-steps");
const elGameModalNote = document.getElementById("game-detail-status-note");
const btnCloseGameModal = document.getElementById("btn-close-game-modal");
const btnDoneGameModal = document.getElementById("btn-game-modal-done");
const gameDetailTriggers = document.querySelectorAll("[data-game-detail]");

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

// Game Catalog Metadata (Honest Preview Info Only — Zero Fake Play Triggers)
const GAME_CATALOG = {
  quiz_battle: {
    badge: "MVP Launch",
    badgeClass: "pill pill--purple",
    title: "Quiz Battle",
    subtitle: "Real-Time Trivia Arena",
    desc: "Race your friends through fast trivia rounds. Faster correct answers score higher as everyone climbs the live podium.",
    tags: ["2–10 Players", "Real-Time Trivia", "Speed Scoring"],
    steps: [
      "Create or join a private room with 2–10 friends.",
      "Everyone sees the same question and 4 choices at once.",
      "Lock in your answer before the timer runs out — top score wins the podium.",
    ],
    note: "Unlocks once Phase 2B private rooms and Phase D5 game engines launch.",
  },
  ttt_tournament: {
    badge: "MVP Launch",
    badgeClass: "pill pill--purple",
    title: "Tic-Tac-Toe Tournament",
    subtitle: "1v1 Knockout Bracket",
    desc: "Classic Tic-Tac-Toe turned into a tense group tournament. Two friends duel live while the rest of the room watches the bracket unfold.",
    tags: ["2–10 Players", "Turn-Based", "Live Spectators"],
    steps: [
      "Players are seeded into a rapid 1v1 knockout bracket.",
      "Active duelists take turns placing X and O on a timed 3×3 board.",
      "Winners advance round by round until one player claims the crown.",
    ],
    note: "Unlocks once Phase 2B private rooms and Phase D5 game engines launch.",
  },
  impostor_word: {
    badge: "Coming Soon",
    badgeClass: "pill pill--upcoming",
    title: "Impostor Word",
    subtitle: "Social Deduction (Post-MVP)",
    desc: "Every player receives the same secret word except the impostors. Give subtle clues without giving the word away, then vote out the bluffers.",
    tags: ["2–10 Players", "Social Deduction", "Planned Expansion"],
    steps: [
      "Most friends receive the secret word; impostors stay in the dark.",
      "Take turns giving a clever one-word clue to prove you know it.",
      "Discuss and vote out the suspected impostors before they guess the word.",
    ],
    note: "Planned post-MVP expansion — not playable yet.",
  },
};

// Auth State
let captchaToken = null;
let turnstileWidgetId = null;
let turnstileBooting = false;
let activeSession = null;
let authStateVersion = 0;

function bumpAuthStateVersion() {
  authStateVersion += 1;
  return authStateVersion;
}

// Profile State (In-Memory Only — Plaintext PIN Is Never Persisted or Logged)
let currentProfile = null;
let selectedAvatar = "🦊";
let revealedRecovery = null;

/* --------------------------------------------------------------------------
   Splash, Dynamic FX Loader, Sound Toggle & UI Helpers
   -------------------------------------------------------------------------- */

function hideSplash() {
  if (window.__pvSplashFallbackTimer) {
    clearTimeout(window.__pvSplashFallbackTimer);
    window.__pvSplashFallbackTimer = null;
  }
  if (!elAppSplash || elAppSplash.hidden) return;
  elAppSplash.classList.add("is-hidden");
  setTimeout(() => {
    elAppSplash.hidden = true;
  }, 240);
}

function loadFxModule() {
  return import("./fx.js")
    .then((fxMod) => {
      if (fxMod && typeof fxMod === "object") {
        fx = { ...fx, ...fxMod };
        renderSoundButton();
      }
    })
    .catch(() => {
      // Runs cleanly with silent no-op fallback if js/fx.js cannot load
    });
}

function renderSoundButton() {
  if (!btnSoundToggle) return;
  const on = fx.isSoundEnabled();
  btnSoundToggle.setAttribute("aria-pressed", String(on));
  btnSoundToggle.setAttribute(
    "aria-label",
    on ? "Sound effects on. Tap to mute." : "Sound effects off. Tap to enable."
  );
  if (elSoundToggleIcon) elSoundToggleIcon.textContent = on ? "🔊" : "🔇";
  if (elSoundToggleLabel) elSoundToggleLabel.textContent = on ? "SFX On" : "SFX Off";
}

function initSoundToggle() {
  renderSoundButton();
  if (!btnSoundToggle) return;
  btnSoundToggle.addEventListener("click", () => {
    const enabled = fx.toggleSound();
    renderSoundButton();
    fx.pulseElement(btnSoundToggle);
    fx.showToast(
      enabled ? "Sound effects enabled" : "Sound effects muted",
      enabled ? "ok" : "info"
    );
  });
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
    if (elLobbyName) elLobbyName.textContent = "Guest Player";
    if (elLobbyAvatar) elLobbyAvatar.textContent = "🦊";
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
  if (elLobbyName) elLobbyName.textContent = profile.nickname;
  if (elLobbyAvatar) elLobbyAvatar.textContent = profile.avatar || "🦊";
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

function switchView(viewName, withSound = false) {
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

  if (withSound) fx.playTab();
  window.scrollTo({ top: 0 });
}

function initNavigation() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.view;
      if (target) switchView(target, true);
    });
  });

  jumpButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.jumpView;
      if (target) switchView(target, true);
    });
  });
}

/* --------------------------------------------------------------------------
   Game Details / Coming Soon Modal
   -------------------------------------------------------------------------- */

function openGameModal(gameKey) {
  const game = GAME_CATALOG[gameKey];
  if (!game || !elGameModal) return;

  if (elGameModalBadge) {
    elGameModalBadge.textContent = game.badge;
    elGameModalBadge.className = game.badgeClass;
  }
  if (elGameModalTitle) elGameModalTitle.textContent = game.title;
  if (elGameModalSubtitle) elGameModalSubtitle.textContent = game.subtitle;
  if (elGameModalDesc) elGameModalDesc.textContent = game.desc;
  if (elGameModalNote) elGameModalNote.textContent = game.note;

  if (elGameModalTags) {
    elGameModalTags.textContent = "";
    game.tags.forEach((tag) => {
      const span = document.createElement("span");
      span.className = "pill pill--cyan";
      span.textContent = tag;
      elGameModalTags.appendChild(span);
    });
  }

  if (elGameModalSteps) {
    elGameModalSteps.textContent = "";
    game.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      elGameModalSteps.appendChild(li);
    });
  }

  elGameModal.hidden = false;
  fx.playModalOpen();
}

function closeGameModal() {
  if (!elGameModal || elGameModal.hidden) return;
  elGameModal.hidden = true;
  fx.playModalClose();
}

function initGameModal() {
  gameDetailTriggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      openGameModal(btn.dataset.gameDetail);
    });
  });

  if (btnCloseGameModal) {
    btnCloseGameModal.addEventListener("click", closeGameModal);
  }
  if (btnDoneGameModal) {
    btnDoneGameModal.addEventListener("click", closeGameModal);
  }
  if (elGameModal) {
    elGameModal.addEventListener("click", (event) => {
      if (event.target === elGameModal) closeGameModal();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeGameModal();
  });
}

/* --------------------------------------------------------------------------
   Profile Loading, Saving, PIN Generation & Recovery (Phase 2A Preserved)
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
      fx.playPop();
      fx.pulseElement(option);
      fx.pulseElement(elAvatarPreview);
    });
  }

  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", async () => {
      if (!currentProfile?.player_code) return;
      try {
        await navigator.clipboard.writeText(currentProfile.player_code);
        btnCopyCode.textContent = "Copied!";
        fx.playCopy();
        fx.burstSparks(btnCopyCode);
        fx.showToast("Player Code copied", "ok");
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
        fx.playSuccess();
        fx.burstSparks(btnSaveProfile);
        setInlineFeedback(elProfileFeedback, "Profile saved.", "ok");
        fx.showToast("Profile saved", "ok");
      } catch (err) {
        fx.playError();
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

        fx.playSuccess();
        setInlineFeedback(
          elPinFeedback,
          isRotating
            ? "New Recovery PIN generated. Your previous PIN no longer works."
            : "Recovery PIN generated. Save it now — it will not be shown again.",
          "ok"
        );
      } catch (err) {
        fx.playError();
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
        fx.playCopy();
        fx.burstSparks(btnCopyRecovery);
        fx.showToast("Code & PIN copied", "ok");
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
      fx.playTap();
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
          fx.playSuccess();
          fx.burstSparks(btnRecoverProfile);
          setInlineFeedback(
            elProfileFeedback,
            result.message || "Profile recovered. Generate a new Recovery PIN if needed.",
            "ok"
          );
          setInlineFeedback(elRecoverFeedback, "");
          if (elRecoverDetails) elRecoverDetails.open = false;
          fx.showToast("Profile recovered", "ok");
        } else {
          fx.playError();
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
        fx.playError();
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
  bumpAuthStateVersion();
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

    bumpAuthStateVersion();
    fx.playTap();
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
      fx.playError();
      setSessionStatus("Sign-In Failed", "error");
      setAuthFeedback(`Could not start guest session:\n${error.message}`, true);
      updateSignInButton();
      return;
    }

    fx.playSuccess();
    showSession(data.session);
  });
}

if (btnSignOut) {
  btnSignOut.addEventListener("click", async () => {
    if (!supabase) return;
    bumpAuthStateVersion();
    fx.playTap();
    btnSignOut.disabled = true;
    clearRevealedPin();
    await supabase.auth.signOut();
    btnSignOut.disabled = false;
    showSession(null);
    setAuthFeedback("Signed out. Complete verification to start a new guest session.");
    fx.showToast("Signed out of guest session", "info");
  });
}

/* --------------------------------------------------------------------------
   Startup (Immediate 4s Fail-Safe, Non-Blocking FX, Safe Pending Session)
   -------------------------------------------------------------------------- */

async function boot() {
  window.__pvBootStarted = true;

  // Register 4-second splash fail-safe immediately before any async or init work
  const splashFailSafe = setTimeout(() => {
    hideSplash();
  }, SPLASH_FAILSAFE_MS);

  // Load optional sound/FX engine in background without blocking startup
  loadFxModule();

  try {
    initSoundToggle();
    initNavigation();
    initGameModal();
    initProfileControls();

    if (!isConfigReady() || !supabase) {
      setSessionStatus("Config Missing", "error");
      if (elAuthCard) elAuthCard.hidden = false;
      if (btnSignIn) btnSignIn.disabled = true;
      setAuthFeedback("Supabase configuration is missing in js/config.js.", true);
      return;
    }

    // Invalidate pending initial session checks if a newer auth event occurs
    if (typeof supabase.auth?.onAuthStateChange === "function") {
      supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          bumpAuthStateVersion();
        }
      });
    }

    const sessionCheckVersion = bumpAuthStateVersion();
    let sessionSettled = false;
    const sessionPromise = supabase.auth.getSession();

    // Handle session resolution even if it completes after the initial timeout,
    // while ignoring stale responses if a newer auth transition already occurred
    sessionPromise
      .then(({ data, error }) => {
        sessionSettled = true;
        if (sessionCheckVersion !== authStateVersion) {
          return;
        }
        if (error) {
          setSessionStatus("Session Error", "error");
          if (elAuthCard) elAuthCard.hidden = false;
          setAuthFeedback(
            `Session check failed:\n${error.message}\n\nRefresh the page to retry.`,
            true
          );
          return;
        }
        showSession(data.session);
      })
      .catch((err) => {
        sessionSettled = true;
        if (sessionCheckVersion !== authStateVersion) {
          return;
        }
        setSessionStatus("Session Error", "error");
        if (elAuthCard) elAuthCard.hidden = false;
        setAuthFeedback(
          `Session check failed:\n${err?.message || "Network error"}\n\nRefresh the page to retry.`,
          true
        );
      });

    await Promise.race([
      sessionPromise.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, SESSION_CHECK_TIMEOUT_MS)),
    ]);

    if (!sessionSettled && sessionCheckVersion === authStateVersion) {
      // Do NOT treat a slow network timeout as signed-out or clear existing auth
      setSessionStatus("Connection Slow", "warn");
      if (elAuthCard) elAuthCard.hidden = false;
      if (btnSignIn) btnSignIn.disabled = true;
      setAuthFeedback(
        "Still checking your saved guest session on a slow connection. " +
          "Your session has not been cleared — wait a moment or refresh the page to retry."
      );
    }
  } catch (err) {
    setSessionStatus("Startup Error", "error");
    if (elAuthCard) elAuthCard.hidden = false;
    if (btnSignIn) btnSignIn.disabled = true;
    setAuthFeedback(
      `Startup error:\n${err?.message || "Unexpected error"}\n\nRefresh the page to retry.`,
      true
    );
  } finally {
    clearTimeout(splashFailSafe);
    hideSplash();
  }
}

boot();
