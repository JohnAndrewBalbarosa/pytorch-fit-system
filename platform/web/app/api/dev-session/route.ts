import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const enabled = () => process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";

export async function GET() {
  const audience = process.env.PYTORCH_FIT_PORTAL_AUDIENCE === "officer" ? "officer" : "member";
  return NextResponse.json({ enabled: enabled(), audience });
}

export async function POST() {
  if (!enabled()) return NextResponse.json({ error: "Local developer access is disabled." }, { status: 403 });
  const jar = await cookies();
  jar.set("pytorch_fit_dev_session", "local-developer", {
    httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 60 * 60 * 12
  });
  return NextResponse.json({ ok: true, next: "/dashboard" });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete("pytorch_fit_dev_session");
  return NextResponse.json({ ok: true });
}
