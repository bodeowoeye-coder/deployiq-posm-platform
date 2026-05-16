import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/supabaseEnv";

export function createBrowserSupabase() {
  const { url, anonKey } = getPublicSupabaseConfig();

  return createClient(url, anonKey);
}
