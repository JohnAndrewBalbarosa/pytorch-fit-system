import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@pytorch-fit/domain-server/identity";

export async function POST(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  } catch {
    // Supabase may be intentionally absent in the local provider mode.
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
