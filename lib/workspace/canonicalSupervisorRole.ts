import { createAdminSupabase } from "../supabaseAdmin.ts";

export type CanonicalSupervisorRoleOutcome =
  | "created"
  | "existing_complete"
  | "existing_customized"
  | "existing_incomplete"
  | "existing_conflicting";

export type CanonicalSupervisorRoleResult = {
  roleId: string;
  outcome: CanonicalSupervisorRoleOutcome;
  permissionCount: number;
  missingPermissions: string[];
  unexpectedPermissions: string[];
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function ensureCanonicalSupervisorRole(input: {
  clientId: string;
  actorUserId: string | null;
}): Promise<CanonicalSupervisorRoleResult> {
  const { data, error } = await createAdminSupabase().rpc("ensure_canonical_supervisor_role", {
    p_client_id: input.clientId,
    p_actor_user_id: input.actorUserId,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const roleId = text(row?.role_id);
  const outcome = text(row?.outcome) as CanonicalSupervisorRoleOutcome;
  if (!roleId || !["created", "existing_complete", "existing_customized", "existing_incomplete", "existing_conflicting"].includes(outcome)) {
    throw new Error("Canonical Supervisor provisioning returned an invalid result.");
  }

  const result = {
    roleId,
    outcome,
    permissionCount: Number(row?.permission_count ?? 0),
    missingPermissions: Array.isArray(row?.missing_permissions) ? row.missing_permissions.filter((value): value is string => typeof value === "string") : [],
    unexpectedPermissions: Array.isArray(row?.unexpected_permissions) ? row.unexpected_permissions.filter((value): value is string => typeof value === "string") : [],
  };
  if (outcome === "existing_incomplete" || outcome === "existing_conflicting") {
    console.warn("[canonical-supervisor-role] Existing role requires review.", {
      clientId: input.clientId,
      outcome,
      permissionCount: result.permissionCount,
      missingPermissions: result.missingPermissions,
      unexpectedPermissions: result.unexpectedPermissions,
    });
  }
  return result;
}
