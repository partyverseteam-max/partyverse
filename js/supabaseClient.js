import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_CONFIG, isConfigReady } from "./config.js";

export const supabase = isConfigReady()
  ? createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
