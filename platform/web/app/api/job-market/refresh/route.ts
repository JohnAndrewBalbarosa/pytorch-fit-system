import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const jar = await cookies();
  const localSession = jar.get("pytorch_fit_dev_session")?.value === "local-developer";
  const devEnabled = process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";
  if (!localSession || !devEnabled) return NextResponse.json({ error: "Local developer authorization required." }, { status: 403 });
  const token = process.env.PYTORCH_FIT_DEV_API_TOKEN || "";
  if (!token) return NextResponse.json({ error: "PYTORCH_FIT_DEV_API_TOKEN is not configured." }, { status: 503 });
  const backend = process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";
  const body = await request.json();
  try {
    const response = await fetch(`${backend}/api/job-market/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dev-Api-Token": token },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Local FastAPI service is unavailable." }, { status: 503 });
  }
}
