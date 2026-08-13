import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/career", "/jobs", "/connections", "/events", "/leaderboards", "/settings", "/admin"];

export function proxy(request: NextRequest) {
  if (!protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) return NextResponse.next();
  const localSession = request.cookies.get("pytorch_fit_dev_session")?.value === "local-developer";
  const devEnabled = process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";
  if (localSession && devEnabled) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/dashboard/:path*", "/career/:path*", "/jobs/:path*", "/connections/:path*", "/events/:path*", "/leaderboards/:path*", "/settings/:path*", "/admin/:path*"] };
