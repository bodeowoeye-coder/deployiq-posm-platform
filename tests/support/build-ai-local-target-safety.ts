import "server-only";

export type BuildAILocalTargetSafetyResult = {
  ok: true;
  application: "loopback-local";
  supabase: "loopback-local";
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function exactLoopbackTarget(value: string | undefined, port: string): boolean {
  if (!value) return false;
  try {
    const target = new URL(value);
    return target.protocol === "http:"
      && LOOPBACK_HOSTS.has(target.hostname.toLowerCase())
      && target.port === port
      && target.username === ""
      && target.password === ""
      && (target.pathname === "" || target.pathname === "/")
      && target.search === ""
      && target.hash === "";
  } catch {
    return false;
  }
}

export function inspectBuildAILocalAcceptanceTargets(input: {
  applicationUrl?: string;
  supabaseUrl?: string;
}): BuildAILocalTargetSafetyResult | { ok: false; reason: "local_target_required" } {
  if (!exactLoopbackTarget(input.applicationUrl, "3000") || !exactLoopbackTarget(input.supabaseUrl, "54321")) {
    return { ok: false, reason: "local_target_required" };
  }
  return { ok: true, application: "loopback-local", supabase: "loopback-local" };
}
