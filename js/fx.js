/* ==========================================================================
   PartyVerse — Stage D2.2: Original Web Audio Synthesizer & Micro-FX Engine
   Zero external audio files. Sound is OFF by default per UX Design Plan.
   Respects prefers-reduced-motion for all visual effects.
   ========================================================================== */

const STORAGE_KEY_SOUND = "pv_sound_enabled";

let audioCtx = null;
let soundEnabled = loadSoundPreference();
let toastTimer = null;

function loadSoundPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY_SOUND) === "true";
  } catch {
    return false;
  }
}

function saveSoundPreference(enabled) {
  try {
    window.localStorage.setItem(STORAGE_KEY_SOUND, enabled ? "true" : "false");
  } catch {
    // Ignore storage errors in restricted browsing modes
  }
}

export function prefersReducedMotion() {
  return Boolean(
    window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  saveSoundPreference(soundEnabled);
  if (soundEnabled) {
    ensureAudioContext();
    playToneSeq([
      { freq: 523.25, dur: 0.065, delay: 0, type: "sine", gain: 0.06 },
      { freq: 659.25, dur: 0.09, delay: 0.055, type: "sine", gain: 0.065 },
    ]);
  }
  return soundEnabled;
}

export function toggleSound() {
  return setSoundEnabled(!soundEnabled);
}

function ensureAudioContext() {
  if (!soundEnabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playToneSeq(notes) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  notes.forEach(({ freq, endFreq, dur = 0.08, delay = 0, type = "sine", gain = 0.06 }) => {
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const start = now + delay;
      const stop = start + dur;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (endFreq && endFreq > 0) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, stop);
      }

      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.linearRampToValueAtTime(gain, start + Math.min(0.012, dur * 0.25));
      amp.gain.exponentialRampToValueAtTime(0.0001, stop);

      osc.connect(amp);
      amp.connect(ctx.destination);

      osc.start(start);
      osc.stop(stop + 0.01);
    } catch {
      // Never let audio errors interrupt UI interactions
    }
  });
}

/* --------------------------------------------------------------------------
   Sound Presets (Soft, Modern, Non-Intrusive)
   -------------------------------------------------------------------------- */

export function playTap() {
  playToneSeq([
    { freq: 440, endFreq: 320, dur: 0.045, type: "triangle", gain: 0.045 },
  ]);
}

export function playTab() {
  playToneSeq([
    { freq: 360, endFreq: 540, dur: 0.07, type: "sine", gain: 0.045 },
  ]);
}

export function playPop() {
  playToneSeq([
    { freq: 340, endFreq: 680, dur: 0.065, type: "sine", gain: 0.055 },
  ]);
}

export function playCopy() {
  playToneSeq([
    { freq: 587.33, dur: 0.06, delay: 0, type: "sine", gain: 0.055 },
    { freq: 880, dur: 0.09, delay: 0.05, type: "sine", gain: 0.06 },
  ]);
}

export function playSuccess() {
  playToneSeq([
    { freq: 523.25, dur: 0.075, delay: 0, type: "sine", gain: 0.055 },
    { freq: 659.25, dur: 0.08, delay: 0.06, type: "sine", gain: 0.06 },
    { freq: 783.99, dur: 0.13, delay: 0.12, type: "triangle", gain: 0.065 },
  ]);
}

export function playError() {
  playToneSeq([
    { freq: 260, endFreq: 210, dur: 0.09, delay: 0, type: "triangle", gain: 0.055 },
    { freq: 200, endFreq: 165, dur: 0.11, delay: 0.085, type: "triangle", gain: 0.05 },
  ]);
}

export function playModalOpen() {
  playToneSeq([
    { freq: 392, endFreq: 587.33, dur: 0.085, type: "sine", gain: 0.045 },
  ]);
}

export function playModalClose() {
  playToneSeq([
    { freq: 480, endFreq: 320, dur: 0.07, type: "sine", gain: 0.04 },
  ]);
}

export function playReady() {
  playToneSeq([
    { freq: 440, dur: 0.06, delay: 0, type: "sine", gain: 0.055 },
    { freq: 659.25, dur: 0.11, delay: 0.05, type: "triangle", gain: 0.06 },
  ]);
}

export function playVictory() {
  playToneSeq([
    { freq: 523.25, dur: 0.09, delay: 0, type: "triangle", gain: 0.06 },
    { freq: 659.25, dur: 0.09, delay: 0.08, type: "triangle", gain: 0.065 },
    { freq: 783.99, dur: 0.1, delay: 0.16, type: "triangle", gain: 0.07 },
    { freq: 1046.5, dur: 0.22, delay: 0.24, type: "sine", gain: 0.075 },
  ]);
}

/* --------------------------------------------------------------------------
   Lightweight GPU-Only Visual Micro-FX (Respects prefers-reduced-motion)
   -------------------------------------------------------------------------- */

export function pulseElement(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove("fx-pop");
  // Trigger reflow to restart animation cleanly
  void el.offsetWidth;
  el.classList.add("fx-pop");
  el.addEventListener(
    "animationend",
    () => el.classList.remove("fx-pop"),
    { once: true }
  );
}

export function burstSparks(originEl) {
  if (!originEl || prefersReducedMotion()) return;
  const rect = originEl.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#8757F7", "#24C6B7", "#42D6E8", "#39D99A"];
  const count = 6;

  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("span");
    dot.className = "fx-spark";
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.35 - 0.175);
    const dist = 26 + Math.random() * 18;
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    dot.style.backgroundColor = colors[i % colors.length];
    dot.style.setProperty("--fx-dx", `${Math.cos(angle) * dist}px`);
    dot.style.setProperty("--fx-dy", `${Math.sin(angle) * dist}px`);
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 540);
  }
}

/* --------------------------------------------------------------------------
   Floating Toast Notifications
   -------------------------------------------------------------------------- */

export function showToast(message, tone = "info") {
  const region = document.getElementById("pv-toast-region");
  if (!region || !message) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  region.textContent = "";
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${tone}`;
  toast.textContent = message;
  region.appendChild(toast);

  // Trigger enter transition
  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => {
      if (toast.parentNode === region) toast.remove();
    }, 220);
  }, 2600);
}
