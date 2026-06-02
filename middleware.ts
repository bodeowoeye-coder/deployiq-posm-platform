import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/login" && request.method !== "GET" && request.method !== "HEAD") {
    const url = request.nextUrl.clone();
    url.search = "";
    return NextResponse.redirect(url, { status: 303 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login"]
};
