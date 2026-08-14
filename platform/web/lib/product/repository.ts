import { LocalProductRepository } from "./local-repository";
import { SupabaseProductRepository } from "./supabase-repository";
import type { ProductProvider, ProductRepository } from "./contracts";

export function configuredProductProvider(): ProductProvider {
  return process.env.PYTORCH_FIT_DATA_PROVIDER === "supabase" ? "supabase" : "local";
}

export function productRepository(): ProductRepository {
  return configuredProductProvider() === "supabase"
    ? new SupabaseProductRepository()
    : new LocalProductRepository();
}
