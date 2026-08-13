import { NextRequest, NextResponse } from "next/server";

const endpoints: Record<string, string> = {
  "job-finder/control-state": "/api/job-finder/control-state",
  "job-finder/market-fit": "/api/job-finder/market-fit",
  "onboarding/state": "/api/onboarding/state",
  "resumes": "/api/resumes",
  "auth/status": "/api/auth/status"
};

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = endpoints[path.join("/")];
  if (!target) return NextResponse.json({ error: "Unsupported service route." }, { status: 404 });
  const backend = process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${backend}${target}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Local FastAPI service is unavailable.", service: target }, { status: 503 });
  }
}
