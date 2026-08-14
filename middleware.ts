import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/login" && request.method !== "GET" && request.method !== "HEAD") {
    const url = request.nextUrl.clone();
    url.search = "";
    return NextResponse.redirect(url, { status: 303 });
  }

  if (request.nextUrl.pathname === "/workspace/admin" || request.nextUrl.pathname.startsWith("/workspace/admin/")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-deployiq-return-to", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/workspace/admin/:path*"]
};
