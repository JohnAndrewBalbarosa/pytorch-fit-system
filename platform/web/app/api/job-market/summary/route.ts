import { NextRequest, NextResponse } from "next/server";
import { officerApiError } from "@/lib/auth/api-authorization";
import { fallbackMarketSummary } from "@/lib/job-market";
import { configuredProductProvider } from "@/lib/product/repository";

export async function GET(request: NextRequest) {
  const denied = await officerApiError();
  if (denied) return denied;
  const backend = process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";
  const allowed = new URLSearchParams();
  for (const key of ["countries", "role_family", "work_mode", "days"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) allowed.set(key, value.slice(0, 240));
  }
  if (configuredProductProvider() === "local") {
    const countries = (allowed.get("countries") || "Philippines").split(",").filter(Boolean);
    return NextResponse.json({ ...fallbackMarketSummary, generated_at: new Date().toISOString(), query: { countries, role_family: allowed.get("role_family") || "software", work_mode: allowed.get("work_mode") || "any", days: Number(allowed.get("days") || 90) } }, { headers: { "Cache-Control": "private, no-store", "X-Data-Mode": "local-demo" } });
  }
  try {
    const response = await fetch(`${backend}/api/job-market/summary?${allowed}`, {
      cache: "no-store", signal: AbortSignal.timeout(16_000)
    });
    if (!response.ok) throw new Error(`backend returned ${response.status}`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Production job-market data is unavailable." }, { status: 503 });
  }
}
