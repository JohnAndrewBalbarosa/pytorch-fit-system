import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  } catch {
    // Supabase may be intentionally absent in the local provider mode.
  }
  const jar = await cookies();
  jar.delete("pytorch_fit_dev_session");
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
