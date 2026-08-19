import { LocalProductRepository } from "./local-repository";
import { SupabaseProductRepository } from "./supabase-repository";
import type { ProductProvider, ProductRepository } from "./contracts";

export function configuredProductProvider(): ProductProvider {
  if (process.env.NODE_ENV === "production" && process.env.PYTORCH_FIT_DATA_PROVIDER !== "supabase") {
    throw new Error("Production requires PYTORCH_FIT_DATA_PROVIDER=supabase; local demo data is disabled.");
  }
  return process.env.PYTORCH_FIT_DATA_PROVIDER === "supabase" ? "supabase" : "local";
}

export function productRepository(): ProductRepository {
  return configuredProductProvider() === "supabase"
    ? new SupabaseProductRepository()
    : new LocalProductRepository();
}
