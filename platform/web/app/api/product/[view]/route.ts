import { NextResponse } from "next/server";
import { currentProductUserId } from "@/lib/auth/current-user";
import { isProductView } from "@/lib/product/contracts";
import { productRepository } from "@/lib/product/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ view: string }> }) {
  const { view } = await context.params;
  if (!isProductView(view)) return NextResponse.json({ error: "Unknown product view." }, { status: 404 });
  const userId = await currentProductUserId();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const payload = await productRepository().read(view, userId);
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product data is unavailable." }, { status: 503 });
  }
}
