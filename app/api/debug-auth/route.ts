import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";

export const dynamic = "force-dynamic";

type SafeError = {
  message: string;
};

function safeError(error: unknown): SafeError {
  return {
    message: error instanceof Error ? error.message : "Unknown error"
  };
}

export async function GET() {
  try {
    const cookieStore = cookies();
    const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
    const deployiqAccessToken = cookieStore.get("deployiq-access-token")?.value ?? null;
    const deployiqRefreshToken = cookieStore.get("deployiq-refresh-token")?.value ?? null;
    const appAccessToken = cookieStore.get("sb-access-token")?.value ?? null;
    const appRefreshToken = cookieStore.get("sb-refresh-token")?.value ?? null;

    const response = {
      cookies: {
        names: cookieNames,
        deployiqAccessTokenExists: Boolean(deployiqAccessToken),
        deployiqRefreshTokenExists: Boolean(deployiqRefreshToken),
        appAccessTokenCookieName: "sb-access-token",
        appRefreshTokenCookieName: "sb-refresh-token",
        appAccessTokenExists: Boolean(appAccessToken),
        appRefreshTokenExists: Boolean(appRefreshToken)
      },
      authGetUser: {
        attempted: false,
        succeeded: false,
        userId: null as string | null,
        email: null as string | null,
        error: null as SafeError | null
      },
      userRoles: {
        attempted: false,
        found: false,
        role: null as string | null,
        error: null as SafeError | null
      },
      adminFallback: {
        attempted: false,
        worked: false,
        found: false,
        role: null as string | null,
        error: null as SafeError | null
      },
      currentUserContext: {
        attempted: false,
        resolved: false,
        role: null as string | null,
        clientId: null as string | null,
        error: null as SafeError | null
      }
    };

    if (appAccessToken) {
      try {
        response.authGetUser.attempted = true;
        const userClient = createUserSupabase(appAccessToken);
        const { data, error } = await userClient.auth.getUser();

        if (error || !data.user) {
          response.authGetUser.error = {
            message: error?.message ?? "No user returned"
          };
        } else {
          response.authGetUser.succeeded = true;
          response.authGetUser.userId = data.user.id;
          response.authGetUser.email = data.user.email ?? null;

          try {
            response.userRoles.attempted = true;
            const { data: roleRow, error: roleError } = await userClient
              .from("user_roles")
              .select("user_id, role, client_id")
              .eq("user_id", data.user.id)
              .maybeSingle();

            if (roleError) {
              response.userRoles.error = safeError(roleError);
            } else if (roleRow) {
              response.userRoles.found = true;
              response.userRoles.role = roleRow.role;
            }
          } catch (error) {
            response.userRoles.error = safeError(error);
          }

          try {
            response.adminFallback.attempted = true;
            const admin = createAdminSupabase();
            const { data: adminRole, error: adminRoleError } = await admin
              .from("user_roles")
              .select("user_id, role, client_id")
              .eq("user_id", data.user.id)
              .maybeSingle();

            if (adminRoleError) {
              response.adminFallback.error = safeError(adminRoleError);
            } else {
              response.adminFallback.worked = true;
              response.adminFallback.found = Boolean(adminRole);
              response.adminFallback.role = adminRole?.role ?? null;
            }
          } catch (error) {
            response.adminFallback.error = safeError(error);
          }
        }
      } catch (error) {
        response.authGetUser.error = safeError(error);
      }
    }

    try {
      response.currentUserContext.attempted = true;
      const context = await getCurrentUserContext();
      response.currentUserContext.resolved = Boolean(context);
      response.currentUserContext.role = context?.role.role ?? null;
      response.currentUserContext.clientId = context?.role.client_id ?? null;
    } catch (error) {
      response.currentUserContext.error = safeError(error);
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Debug auth route failed.",
        details: safeError(error)
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  }
}
