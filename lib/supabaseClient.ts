import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/supabaseEnv";

type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

export function createBrowserSupabase(config?: PublicSupabaseConfig) {
  const { url, anonKey } = config ?? getPublicSupabaseConfig();

  return createClient(url, anonKey);
}
