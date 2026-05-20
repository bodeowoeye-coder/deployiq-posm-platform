import { NextResponse } from "next/server";

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 0
  });
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  ["deployiq-access-token", "deployiq-refresh-token"].forEach((name) => {
    clearCookie(response, name);
  });
  return response;
}
