import { createClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const supabaseUrl = env?.VITE_SUPABASE_URL || "https://jjsmiasihdshayvkmyum.supabase.co";
const supabasePublishableKey = env?.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_G59BoJul0eU3X3mQ4I00Gg_bj1xEOHe";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
