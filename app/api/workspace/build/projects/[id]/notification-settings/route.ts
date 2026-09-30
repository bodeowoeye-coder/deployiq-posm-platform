import { NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { getBuildNotificationSettings, updateBuildNotificationSettings } from "@/lib/build/notifications/settingsService";

const responseForError = (error: unknown) => NextResponse.json({ error: error instanceof AccessControlError ? error.message : "Notification settings are unavailable." }, { status: error instanceof AccessControlError ? error.status : 500 });

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(await getBuildNotificationSettings({ projectId: params.id, request })); } catch (error) { return responseForError(error); }
}
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(await updateBuildNotificationSettings({ projectId: params.id, request, update: await request.json() })); } catch (error) { return responseForError(error); }
}
