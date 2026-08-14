import { NextResponse } from "next/server";
import { createAgency, getAgencyDashboard, updateAgency } from "@/lib/workspace/fieldResources";

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
    const dashboard = await getAgencyDashboard({
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      state: searchParams.get("state"),
      sort: searchParams.get("sort"),
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to load agencies.") }, { status: status(error) });
  }
}

export async function POST(request: Request) {
  try {
    const result = await createAgency(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to create agency.") }, { status: status(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await updateAgency(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to update agency.") }, { status: status(error) });
  }
}
