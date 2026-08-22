import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth/viewer";
import { createFeedbackReport, readFeedbackReports } from "@/lib/trust-center";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await currentViewer();
  if (!viewer.userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await readFeedbackReports(viewer), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reports unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const viewer = await currentViewer();
  try {
    const report = await createFeedbackReport(viewer, await request.json());
    return NextResponse.json({ id: report.id, status: report.status }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report could not be accepted.";
    return NextResponse.json({ error: message }, { status: message === "Authentication required." ? 401 : 400 });
  }
}
