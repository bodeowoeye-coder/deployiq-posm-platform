import { NextResponse } from "next/server";
import { clearDeployIqAuthCookies } from "@/lib/authSessionCookies";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login?loggedOut=1", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  clearDeployIqAuthCookies(response, request);
  return response;
}
