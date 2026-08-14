import { NextResponse } from "next/server";
import { createInstaller, getInstallerDashboard, updateInstaller } from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getInstallerDashboard({
      search: searchParams.get("search"),
      agency: searchParams.get("agency"),
      status: searchParams.get("status"),
      state: searchParams.get("state"),
      sort: searchParams.get("sort"),
      page: Number(searchParams.get("page") ?? 1),
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to load installers.") }, { status: status(error) });
  }
}

export async function POST(request: Request) {
  try {
    const result = await createInstaller(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to create installer.") }, { status: status(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await updateInstaller(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to update installer.") }, { status: status(error) });
  }
}
