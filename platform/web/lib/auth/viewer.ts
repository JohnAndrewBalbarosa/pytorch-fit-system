import { cookies } from "next/headers";
import type { UserTier } from "@/lib/permissions";
import { portalAudience, type PortalAudience } from "@/lib/portal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProductRole = "member" | "premium" | "research" | "moderator" | "admin" | "super_admin";

export type ViewerContext = {
  userId: string | null;
  audience: PortalAudience;
  role: ProductRole | "anonymous";
  isOfficer: boolean;
  isAdmin: boolean;
  canViewDiagnostics: boolean;
  userTier: UserTier;
  localDevelopment: boolean;
};

const developmentAccessEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";

function tierFor(role: ProductRole | "anonymous", isOfficer: boolean): UserTier {
  if (isOfficer || role === "admin" || role === "super_admin") return "admin";
  if (role === "premium" || role === "research") return "leaderboard";
  if (role === "moderator") return "active";
  return "general";
}

export async function currentViewer(): Promise<ViewerContext> {
  const audience = portalAudience();
  const jar = await cookies();
  const localSession = jar.get("pytorch_fit_dev_session")?.value === "local-developer";
  if (developmentAccessEnabled() && (localSession || process.env.PYTORCH_FIT_DEV_BYPASS_SIGN_IN === "1")) {
    const isOfficer = audience === "officer";
    const role: ProductRole = isOfficer ? "admin" : "member";
    return {
      userId: process.env.PYTORCH_FIT_DEV_USER_ID || (isOfficer
        ? "00000000-0000-4000-8000-000000000002"
        : "00000000-0000-4000-8000-000000000001"),
      audience,
      role,
      isOfficer,
      isAdmin: isOfficer,
      canViewDiagnostics: isOfficer,
      userTier: tierFor(role, isOfficer),
      localDevelopment: true,
    };
  }

  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return anonymousViewer(audience);
    const { data: profile } = await client
      .from("member_profiles")
      .select("role,is_officer")
      .eq("id", auth.user.id)
      .maybeSingle();
    const role = (profile?.role || "member") as ProductRole;
    const isAdmin = role === "admin" || role === "super_admin";
    const isOfficer = Boolean(profile?.is_officer) || isAdmin;
    return {
      userId: auth.user.id,
      audience,
      role,
      isOfficer,
      isAdmin,
      canViewDiagnostics: isOfficer,
      userTier: tierFor(role, isOfficer),
      localDevelopment: false,
    };
  } catch {
    return anonymousViewer(audience);
  }
}

function anonymousViewer(audience: PortalAudience): ViewerContext {
  return {
    userId: null,
    audience,
    role: "anonymous",
    isOfficer: false,
    isAdmin: false,
    canViewDiagnostics: false,
    userTier: "general",
    localDevelopment: false,
  };
}

export function viewerMayUseOfficerPortal(viewer: ViewerContext) {
  return viewer.audience === "officer" && viewer.isOfficer;
}
