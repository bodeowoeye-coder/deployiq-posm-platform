import { NextResponse } from "next/server";
import { submitDeploymentEvidence } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("multipart/form-data")
      ? await request.formData()
      : await request.json();
    if (body instanceof FormData) {
      const image = body.get("image");
      return NextResponse.json(await submitDeploymentEvidence({
        assignmentId: params.id,
        localSubmissionId: value(body, "localSubmissionId"),
        arrivalLatitude: value(body, "latitude"),
        arrivalLongitude: value(body, "longitude"),
        beforePhotoUrl: value(body, "beforePhotoReference"),
        afterPhotoUrl: value(body, "afterPhotoReference"),
        additionalPhotoUrls: value(body, "additionalPhotoUrls"),
        notes: value(body, "notes"),
        capturedAt: value(body, "capturedAt"),
        offlineSyncStatus: "synced",
        image: image instanceof File ? image : null,
      }));
    }
    return NextResponse.json(await submitDeploymentEvidence({ ...body, assignmentId: params.id }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit deployment evidence." }, { status: status(error) });
  }
}
