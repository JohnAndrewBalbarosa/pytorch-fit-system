import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/auth/viewer";
import { reviewEvidenceClaim } from "@/lib/operations-center";
import { evidenceReviewSchema } from "@/lib/operations-contracts";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const body = evidenceReviewSchema.parse(await request.json()); return NextResponse.json(await reviewEvidenceClaim(await currentViewer(), (await context.params).id, body.decision), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { const message = error instanceof Error ? error.message : "Review failed"; return NextResponse.json({ error: message }, { status: message.includes("authorization") || message.includes("department") ? 403 : message.includes("not found") ? 404 : 422 }); } }
