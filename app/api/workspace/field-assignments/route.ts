import { NextResponse } from "next/server";
import { assignFieldResources, removeFieldAssignment } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await assignFieldResources(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to assign field resources.") }, { status: status(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    return NextResponse.json(await removeFieldAssignment(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to remove field assignment.") }, { status: status(error) });
  }
}
