import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isOfficerOnlyPath, memberDestination, portalAudience, portalOrigin } from "@/lib/portal";

const protectedPrefixes = ["/dashboard", "/career", "/jobs", "/connections", "/events", "/leaderboards", "/settings", "/trust", "/reports", "/membership", "/admin"];
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

function redirectToMember(request: NextRequest) {
  const destination = memberDestination(request.nextUrl.pathname);
  const url = new URL(destination, portalOrigin("member"));
  if (destination === request.nextUrl.pathname) url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/login" && signInBypassEnabled()) {
    const requestedNext = searchParams.get("next");
    const destination = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";
    return attachDevelopmentSession(NextResponse.redirect(new URL(destination, request.url)));
  }
  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
  const audience = portalAudience();
  if (signInBypassEnabled()) {
    if (audience === "member" && isOfficerOnlyPath(pathname)) return redirectToMember(request);
    return attachDevelopmentSession(NextResponse.next());
  }
  const localSession = request.cookies.get(DEV_SESSION_COOKIE)?.value === "local-developer";
  if (localSession && developmentAccessEnabled()) {
    if (audience === "member" && isOfficerOnlyPath(pathname)) return redirectToMember(request);
    return NextResponse.next();
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase
        .from("member_profiles")
        .select("role,is_officer,membership_status,membership_paid")
        .eq("id", data.user.id)
        .maybeSingle();
      const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
      const isOfficer = Boolean(profile?.is_officer) || isAdmin;
      if (audience === "officer" && !isOfficer) return redirectToMember(request);
      if (audience === "member" && isOfficerOnlyPath(pathname)) return redirectToMember(request);
      if (audience === "member" && !isOfficer && pathname !== "/membership" && (profile?.membership_status !== "active" || profile?.membership_paid !== true)) {
        return NextResponse.redirect(new URL("/membership", request.url));
      }
      return response;
    }
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/login", "/dashboard/:path*", "/career/:path*", "/jobs/:path*", "/connections/:path*", "/events/:path*", "/leaderboards/:path*", "/settings/:path*", "/trust/:path*", "/reports/:path*", "/membership/:path*", "/admin/:path*"] };
