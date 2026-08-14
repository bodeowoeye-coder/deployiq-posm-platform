import { NextResponse } from "next/server";

export const DEPLOYIQ_AUTH_COOKIE_NAMES = [
  "deployiq-access-token",
  "deployiq-refresh-token",
  "sb-access-token",
  "sb-refresh-token",
] as const;

export function isSecureAuthCookie(request: Request) {
  return process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
}

export function setAuthCookie(response: NextResponse, request: Request, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAuthCookie(request),
    path: "/",
    maxAge,
  });
}

export function clearAuthCookie(response: NextResponse, request: Request, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAuthCookie(request),
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export function clearDeployIqAuthCookies(response: NextResponse, request: Request) {
  DEPLOYIQ_AUTH_COOKIE_NAMES.forEach((name) => {
    clearAuthCookie(response, request, name);
  });
}

export function setDeployIqSessionCookies(response: NextResponse, request: Request, input: { accessToken: string; refreshToken: string }) {
  setAuthCookie(response, request, "deployiq-access-token", input.accessToken, 60 * 60 * 24 * 7);
  setAuthCookie(response, request, "deployiq-refresh-token", input.refreshToken, 60 * 60 * 24 * 7);
}
