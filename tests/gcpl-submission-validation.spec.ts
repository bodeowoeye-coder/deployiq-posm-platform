import { test, expect } from "@playwright/test";
import { validateGCPLInsertedSubmission, GCPL_PILOT_CLIENT_ID, GCPL_PILOT_PROJECT_ID, GCPL_PILOT_PROJECT_NAME } from "@/lib/submissionValidation";

// Mock supabase factory
function mockSupabase() {
  let deleted = false;
  return {
    deletedFlag: () => deleted,
    from: (tableName: string) => {
      return {
        delete: async () => {
          deleted = true;
          return { data: null, error: null };
        },
        eq: function () {
          return this;
        }
      };
    }
  } as any;
}

test.describe("GCPL submission validation helper", () => {
  test("accepts a correctly populated GCPL insertion", async () => {
    const supabase = mockSupabase();
    const inserted = {
      id: "abc-1",
      client_id: GCPL_PILOT_CLIENT_ID,
      project_id: GCPL_PILOT_PROJECT_ID,
      project_name: GCPL_PILOT_PROJECT_NAME
    } as Record<string, unknown>;

    await expect(validateGCPLInsertedSubmission(supabase, inserted)).resolves.toBeUndefined();
    expect(supabase.deletedFlag()).toBe(false);
  });

  test("deletes and throws when inserted row has null ids", async () => {
    const supabase = mockSupabase();
    const inserted = {
      id: "bad-1",
      client_id: null,
      project_id: null,
      project_name: null
    } as Record<string, unknown>;

    await expect(validateGCPLInsertedSubmission(supabase, inserted)).rejects.toThrow(
      "Submission failed server validation for GCPL pilot: inconsistent project/client data."
    );
    expect(supabase.deletedFlag()).toBe(true);
  });
});
