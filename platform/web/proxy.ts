import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/career", "/jobs", "/connections", "/events", "/leaderboards", "/settings", "/admin"];
const DEV_SESSION_COOKIE = "pytorch_fit_dev_session";

const developmentAccessEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";

const signInBypassEnabled = () =>
  developmentAccessEnabled() && process.env.PYTORCH_FIT_DEV_BYPASS_SIGN_IN === "1";

function attachDevelopmentSession(response: NextResponse) {
  response.cookies.set(DEV_SESSION_COOKIE, "local-developer", {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/login" && signInBypassEnabled()) {
    const requestedNext = searchParams.get("next");
    const destination = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";
    return attachDevelopmentSession(NextResponse.redirect(new URL(destination, request.url)));
  }
  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
  if (signInBypassEnabled()) return attachDevelopmentSession(NextResponse.next());
  const localSession = request.cookies.get(DEV_SESSION_COOKIE)?.value === "local-developer";
  if (localSession && developmentAccessEnabled()) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/login", "/dashboard/:path*", "/career/:path*", "/jobs/:path*", "/connections/:path*", "/events/:path*", "/leaderboards/:path*", "/settings/:path*", "/admin/:path*"] };
