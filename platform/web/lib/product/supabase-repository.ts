import type { ProductRepository, ProductView, ProductViewData } from "./contracts";
import { unavailableDashboardAnalytics } from "./contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resumeProfileFromEvidence } from "./resume-profile";

export class SupabaseProductRepository implements ProductRepository {
  readonly provider = "supabase" as const;

  async read(view: ProductView, userId: string): Promise<ProductViewData> {
    const client = await createSupabaseServerClient();
    const [{ data, error }, { data: detail }, { data: member }, { data: auth }] = await Promise.all([
      client.rpc("product_view", { requested_view: view, requested_user_id: userId }),
      client.rpc("career_evidence_detail", { requested_user_id: userId }),
      client.from("member_profiles").select("display_name").eq("id", userId).single(),
      client.auth.getUser(),
    ]);
    if (error) throw new Error(`Supabase product view failed: ${error.message}`);
    if (!data || typeof data !== "object") throw new Error("Supabase product view returned no data.");
    const payload = data as unknown as ProductViewData;
    const detailPayload = detail && typeof detail === "object" ? detail as { items?: Array<Record<string, unknown>>; sources?: NonNullable<ProductViewData["evidence"]>["sources"] } : {};
    const items = await Promise.all((detailPayload.items || []).map(async (item) => {
      const mediaPath = typeof item.mediaPath === "string" ? item.mediaPath : "";
      if (!mediaPath) return item;
      const { data: signed } = await client.storage.from("career-evidence-media").createSignedUrl(mediaPath, 60 * 10);
      return { ...item, mediaUrl: signed?.signedUrl || "" };
    }));
    const typedItems = items as NonNullable<ProductViewData["evidence"]>["items"];
    const resumeProfile = resumeProfileFromEvidence(typedItems || [], { fullName: member?.display_name || "Career profile", email: auth.user?.email || "" });
    return {
      ...payload,
      evidence: payload.evidence ? { ...payload.evidence, items: typedItems, sources: detailPayload.sources || payload.evidence.sources } : payload.evidence,
      resumeProfile,
      meta: { source: "live", provider: "supabase", mode: "production", synthetic: false, generatedAt: new Date().toISOString(), label: "Live Supabase data" },
      analytics: payload.analytics || unavailableDashboardAnalytics(),
    };
  }
}
