import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const developmentAccessEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.PYTORCH_FIT_DEV_ACCESS === "1";

export async function currentProductUserId(): Promise<string | null> {
  const jar = await cookies();
  const localSession = jar.get("pytorch_fit_dev_session")?.value === "local-developer";
  if (developmentAccessEnabled() && (localSession || process.env.PYTORCH_FIT_DEV_BYPASS_SIGN_IN === "1")) {
    return process.env.PYTORCH_FIT_DEV_USER_ID || "00000000-0000-4000-8000-000000000001";
  }
  try {
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    return data.user?.id || null;
  } catch {
    return null;
  }
}
