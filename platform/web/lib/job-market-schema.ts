import { z } from "zod";

export const jobMarketFilterSchema = z.object({
  country: z.string().trim().min(2).max(80),
  compareCountry: z.string().trim().max(80),
  role: z.string().trim().min(2).max(80),
  mode: z.enum(["any", "remote", "hybrid", "onsite"]),
});

export type JobMarketFilters = z.infer<typeof jobMarketFilterSchema>;
