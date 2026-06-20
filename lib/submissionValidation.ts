// Reuse constants from submissions route to avoid duplication
export const GCPL_PILOT_PROJECT_ID = "ee726c3f-ed04-4173-bea9-2f542dc8a00c";
export const GCPL_PILOT_CLIENT_ID = "0ed917be-7f62-479e-b875-30624e33778f";
export const GCPL_PILOT_PROJECT_NAME = "Darling Hair Dealer Board";

export async function validateGCPLInsertedSubmission(
  supabase: any,
  insertedSubmission: Record<string, unknown> | null
) {
  const insertedClientId = insertedSubmission?.client_id as string | undefined | null;
  const insertedProjectId = insertedSubmission?.project_id as string | undefined | null;
  const insertedProjectName = insertedSubmission?.project_name as string | undefined | null;

  if (
    !insertedSubmission ||
    insertedClientId !== GCPL_PILOT_CLIENT_ID ||
    insertedProjectId !== GCPL_PILOT_PROJECT_ID ||
    insertedProjectName !== GCPL_PILOT_PROJECT_NAME
  ) {
    // If a row was created but doesn't have the expected pilot IDs/names, remove it and throw an error.
    try {
      if (insertedSubmission?.id) {
        await supabase.from("submissions").delete().eq("id", insertedSubmission.id);
      }
    } catch (cleanupError) {
      console.warn("[submissions] failed to cleanup invalid insertion", { message: (cleanupError as Error).message });
    }
    throw new Error("Submission failed server validation for GCPL pilot: inconsistent project/client data.");
  }
}
