import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    console.info("[login-diagnostics]", {
      stage: typeof body.stage === "string" ? body.stage : "unknown",
      emailPresent: Boolean(body.emailPresent),
      passwordPresent: Boolean(body.passwordPresent),
      isSubmitting: Boolean(body.isSubmitting),
      publicConfigLoaded: body.publicConfigLoaded === true ? true : body.publicConfigLoaded === false ? false : null,
      href: typeof body.href === "string" ? body.href : null,
      userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 180) : null,
      online: typeof body.online === "boolean" ? body.online : null,
      viewport: typeof body.viewport === "string" ? body.viewport : null,
      status: typeof body.status === "number" ? body.status : null,
      ok: typeof body.ok === "boolean" ? body.ok : null,
      hasSession: typeof body.hasSession === "boolean" ? body.hasSession : null,
      hasUser: typeof body.hasUser === "boolean" ? body.hasUser : null,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
      errorName: typeof body.errorName === "string" ? body.errorName : null,
      errorStatus: typeof body.errorStatus === "number" ? body.errorStatus : null,
      errorCode: typeof body.errorCode === "string" ? body.errorCode : null,
      reason: typeof body.reason === "string" ? body.reason : null,
      redirectTo: typeof body.redirectTo === "string" ? body.redirectTo : null,
      emailDomain: typeof body.emailDomain === "string" ? body.emailDomain : null,
      supabaseUrlHost: typeof body.supabaseUrlHost === "string" ? body.supabaseUrlHost : null,
      anonKeyPresent: typeof body.anonKeyPresent === "boolean" ? body.anonKeyPresent : null,
      message: typeof body.message === "string" ? body.message : null
    });
  } catch (error) {
    console.error("[login-diagnostics] failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }

  return NextResponse.json({ ok: true });
}
