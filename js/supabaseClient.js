import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_CONFIG, isConfigReady } from "./config.js";

function getCleanSupabaseUrl(rawUrl) {
  try {
    return new URL(rawUrl.trim()).origin;
  } catch {
    return rawUrl.trim();
  }
}

export const supabase = isConfigReady()
  ? createClient(
      getCleanSupabaseUrl(APP_CONFIG.SUPABASE_URL),
      APP_CONFIG.SUPABASE_ANON_KEY.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    )
  : null;
