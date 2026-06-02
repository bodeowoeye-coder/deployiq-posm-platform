import { NextResponse } from "next/server";

function isSecureCookie(request: Request) {
  return process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
}

function clearCookie(response: NextResponse, request: Request, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login?loggedOut=1", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  ["deployiq-access-token", "deployiq-refresh-token", "sb-access-token", "sb-refresh-token"].forEach((name) => {
    clearCookie(response, request, name);
  });
  return response;
}
