// js/config.js
export const APP_CONFIG = {
  SUPABASE_URL: "https://lssfrccwpcdcctgsjysq.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "sb_publishable_hQAOU5ecpko6Ujbkdwx9WA_UUMyvy6i",
  TURNSTILE_SITE_KEY: "0x4AAAAAAGUJTma0SaKlixoB", // We will get this next
};

export function isConfigReady() {
  return (
    APP_CONFIG.SUPABASE_URL.startsWith("https://") &&
    !APP_CONFIG.SUPABASE_URL.includes("PASTE_YOUR") &&
    APP_CONFIG.SUPABASE_ANON_KEY.length > 20 &&
    !APP_CONFIG.SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  );
}

export function isTurnstileConfigured() {
  return (
    APP_CONFIG.TURNSTILE_SITE_KEY.length > 10 &&
    !APP_CONFIG.TURNSTILE_SITE_KEY.includes("YOUR_CLOUDFLARE")
  );
}
