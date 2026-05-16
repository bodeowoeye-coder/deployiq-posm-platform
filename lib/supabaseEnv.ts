type EnvValueCheck = {
  present: boolean;
  hasOuterWhitespace: boolean;
  startsWithEquals: boolean;
};

function readEnvValue(name: string) {
  return process.env[name] ?? "";
}

function inspectValue(value: string): EnvValueCheck {
  return {
    present: value.length > 0,
    hasOuterWhitespace: value.length > 0 && value.trim() !== value,
    startsWithEquals: value.startsWith("=")
  };
}

export function getPublicSupabaseConfig() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL").trim();
  const anonKey = readEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY").trim();

  if (!url || !anonKey) {
    throw new Error("Missing public Supabase environment variables.");
  }

  if (url.startsWith("=") || anonKey.startsWith("=")) {
    throw new Error("Malformed public Supabase environment variables.");
  }

  return { url, anonKey };
}

export function inspectSupabaseEnvironment() {
  const rawUrl = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const rawAnonKey = readEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const rawServiceRoleKey = readEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  let urlLooksValid = false;
  try {
    urlLooksValid = new URL(rawUrl.trim()).protocol === "https:";
  } catch {
    urlLooksValid = false;
  }

  return {
    nextPublicSupabaseUrl: {
      ...inspectValue(rawUrl),
      urlLooksValid
    },
    nextPublicSupabaseAnonKey: inspectValue(rawAnonKey),
    supabaseServiceRoleKey: inspectValue(rawServiceRoleKey)
  };
}
