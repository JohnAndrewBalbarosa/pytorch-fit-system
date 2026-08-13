import { NextRequest, NextResponse } from "next/server";
import { fallbackMarketSummary } from "@/lib/job-market";

export async function GET(request: NextRequest) {
  const backend = process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";
  const allowed = new URLSearchParams();
  for (const key of ["countries", "role_family", "work_mode", "days"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) allowed.set(key, value.slice(0, 240));
  }
  try {
    const response = await fetch(`${backend}/api/job-market/summary?${allowed}`, {
      cache: "no-store", signal: AbortSignal.timeout(16_000)
    });
    if (!response.ok) throw new Error(`backend returned ${response.status}`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(fallbackMarketSummary, { headers: { "X-Data-Fallback": "synthetic-demo" } });
  }
}
