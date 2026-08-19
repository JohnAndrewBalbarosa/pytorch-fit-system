import { access, constants } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildCapabilityManifest } from "@/lib/capabilities";
import { currentProductUserId } from "@/lib/auth/current-user";
import { configuredProductProvider } from "@/lib/product/repository";

const backend = () => process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";

async function backendJson(route: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${backend()}${route}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return {};
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function normalizedProfileReady() {
  const configured = process.env.JOB_MARKET_PROFILE_JSON?.trim();
  const artifactRoot = process.env.JOB_FINDER_ARTIFACT_DIR?.trim();
  const candidate = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "../..", artifactRoot || "out/application-resumes", "user_profile.json");
  try {
    await access(candidate, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const jar = await cookies();
  const developmentEnabled =
    process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";
  const developmentOwner =
    developmentEnabled
    && (
      process.env.PYTORCH_FIT_DEV_BYPASS_SIGN_IN === "1"
      || jar.get("pytorch_fit_dev_session")?.value === "local-developer"
    );
  const localDemo = developmentOwner && configuredProductProvider() === "local";
  const [auth, onboarding, control, profileReady, productUserId] = await Promise.all([
    backendJson("/api/auth/status"),
    backendJson("/api/onboarding/state"),
    backendJson("/api/job-finder/control-state"),
    normalizedProfileReady(),
    currentProductUserId(),
  ]);
  const identity = auth.identity as Record<string, { connected?: boolean }> | undefined;
  const social = auth.social as Record<string, { connected?: boolean }> | undefined;
  const sessions = control.sessions as { job_sites?: Record<string, { connected?: boolean }> } | undefined;
  const source = onboarding.source as { master_loaded?: boolean; resumes?: Array<{ artifact_ready?: boolean }> } | undefined;

  return NextResponse.json(buildCapabilityManifest({
    developmentOwner,
    authenticatedUser: Boolean(productUserId),
    identityConnected: localDemo || Object.values(identity || {}).some((item) => item.connected),
    socialConnected: localDemo || Object.values(social || {}).some((item) => item.connected),
    jobSiteConnected: localDemo || Object.values(sessions?.job_sites || {}).some((item) => item.connected),
    evidenceReady: localDemo || Boolean(onboarding.ready && source?.master_loaded),
    normalizedProfileReady: localDemo || profileReady,
    resumeArtifactsReady: localDemo || Boolean(source?.resumes?.some((item) => item.artifact_ready)),
    visualDemo: localDemo,
    localDemo,
  }), { headers: { "Cache-Control": "no-store" } });
}
