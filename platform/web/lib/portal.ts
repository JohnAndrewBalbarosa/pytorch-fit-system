export type PortalAudience = "member" | "officer";

const officerOnlyPrefixes = [
  "/admin",
  "/career/advisor",
  "/connections",
  "/jobs/analytics",
  "/jobs/automation",
];

export function portalAudience(): PortalAudience {
  return process.env.PYTORCH_FIT_PORTAL_AUDIENCE === "officer" ? "officer" : "member";
}

export function isOfficerOnlyPath(pathname: string) {
  return officerOnlyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function memberDestination(pathname: string) {
  return isOfficerOnlyPath(pathname) ? "/dashboard" : pathname;
}

export function portalOrigin(audience: PortalAudience) {
  const configured = audience === "officer"
    ? process.env.PYTORCH_FIT_OFFICER_URL
    : process.env.PYTORCH_FIT_MEMBER_URL;
  return configured?.trim().replace(/\/$/, "")
    || `http://127.0.0.1:${audience === "officer" ? "3001" : "3000"}`;
}
