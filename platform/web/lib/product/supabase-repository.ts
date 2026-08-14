import type { ProductRepository, ProductView, ProductViewData } from "./contracts";
import { unavailableDashboardAnalytics } from "./contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class SupabaseProductRepository implements ProductRepository {
  readonly provider = "supabase" as const;

  async read(view: ProductView, userId: string): Promise<ProductViewData> {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("product_view", { requested_view: view, requested_user_id: userId });
    if (error) throw new Error(`Supabase product view failed: ${error.message}`);
    if (!data || typeof data !== "object") throw new Error("Supabase product view returned no data.");
    const payload = data as unknown as ProductViewData;
    return {
      ...payload,
      meta: { source: "live", provider: "supabase", generatedAt: new Date().toISOString(), label: "Live Supabase data" },
      analytics: payload.analytics || unavailableDashboardAnalytics(),
      ...(process.env.NODE_ENV === "development" ? { diagnostics: data } : { diagnostics: undefined }),
    };
  }
}
