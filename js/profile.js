import { supabase } from "./supabaseClient.js";

export const ALLOWED_AVATARS = ["🦊", "🐼", "🐙", "🦉", "👾", "🤖", "🐯", "🐸"];

function ensureClient() {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }
}

/**
 * Fetches the authenticated guest's profile, or atomically creates a pristine
 * profile with a unique 6-character player_code on first load.
 */
export async function getOrCreateMyProfile() {
  ensureClient();
  const { data, error } = await supabase.rpc("get_or_create_my_profile");
  if (error) {
    throw new Error(error.message || "Could not load your profile.");
  }
  return data;
}

/**
 * Saves a sanitized nickname (1–20 chars) and whitelisted preset avatar.
 * Server enforces validation and permanently marks is_customized = true.
 */
export async function updateMyProfile(nickname, avatar) {
  ensureClient();

  const cleanedNickname = String(nickname ?? "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanedNickname.length < 1 || cleanedNickname.length > 20) {
    throw new Error("Nickname must be between 1 and 20 characters.");
  }

  if (!ALLOWED_AVATARS.includes(avatar)) {
    throw new Error("Please select a valid preset avatar.");
  }

  const { data, error } = await supabase.rpc("update_my_profile", {
    p_nickname: cleanedNickname,
    p_avatar: avatar,
  });

  if (error) {
    throw new Error(error.message || "Could not save profile changes.");
  }

  return data;
}

/**
 * Generates (or rotates) a cryptographically random 8-digit Recovery PIN.
 * Returns { player_code, recovery_pin, pin_set_at } ONCE in memory.
 * Never persisted to browser storage or logged.
 */
export async function generateRecoveryPin() {
  ensureClient();
  const { data, error } = await supabase.rpc("generate_recovery_pin");
  if (error) {
    throw new Error(error.message || "Could not generate Recovery PIN.");
  }
  return data;
}

/**
 * Attempts to recover an existing profile using a 6-character Player Code
 * and 8-digit Recovery PIN.
 * Returns structured { ok, code, message, profile } from the server.
 */
export async function recoverProfileWithPin(playerCode, pin) {
  ensureClient();

  const normalizedCode = String(playerCode ?? "").trim().toUpperCase();
  const cleanedPin = String(pin ?? "").trim();

  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalizedCode) || !/^[0-9]{8}$/.test(cleanedPin)) {
    return {
      ok: false,
      code: "RECOVERY_FAILED",
      message: "Recovery failed. Check your details or try again later.",
      profile: null,
    };
  }

  const { data, error } = await supabase.rpc("recover_profile_with_pin", {
    p_player_code: normalizedCode,
    p_pin: cleanedPin,
  });

  if (error) {
    throw new Error("Recovery request failed. Please try again.");
  }

  return data;
}
