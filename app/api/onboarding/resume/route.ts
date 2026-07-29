import { NextResponse } from "next/server";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Resume token is required." }, { status: 400 });
    }
    const draft = await getOnboardingDraftByToken(token);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
