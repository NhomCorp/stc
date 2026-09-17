import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bỏ qua các tài nguyên tĩnh và API health
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("auth_session")?.value;

  // Nếu là trang Login
  if (pathname === "/login") {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Các trang yêu cầu xác thực
  const isProtectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/transactions") ||
    pathname.startsWith("/master") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/change-password");

  if (isProtectedPath) {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/health|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
