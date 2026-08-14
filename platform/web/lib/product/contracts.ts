export const productViews = [
  "dashboard",
  "career-evidence",
  "resumes",
  "job-operations",
  "opportunities",
  "connections",
  "advisor",
] as const;

export type ProductView = (typeof productViews)[number];
export type ProductProvider = "local" | "supabase";
export type ProductSource = "live" | "demo";

export type ProductMeta = {
  source: ProductSource;
  provider: ProductProvider;
  generatedAt: string;
  label: string;
};

export type EvidenceSource = {
  id: string;
  label: string;
  kind: string;
  status: "verified" | "ready" | "blocked";
};

export type ResumeArtifact = {
  id: string;
  label: string;
  summary: string;
  skillGroupCount: number;
  projectCount: number;
  ready: boolean;
  formats: Array<{ label: string; url: string }>;
};

export type ReviewItem = {
  id: string;
  title: string;
  detail: string;
  state: string;
  humanGate: boolean;
};

export type Opportunity = {
  id: string;
  company: string;
  title: string;
  location: string;
  workMode: string;
  stage: string;
  fit: number | null;
};

export type Connection = {
  id: string;
  label: string;
  category: "identity" | "social" | "job_site" | "database";
  status: "connected" | "disconnected" | "verification_required";
  detail: string;
};

export type ProductViewData = {
  meta: ProductMeta;
  heading: { eyebrow: string; title: string; description: string };
  stats: Array<{ label: string; value: string; detail: string }>;
  evidence?: {
    ready: boolean;
    phase: string;
    profileFacts: Array<{ label: string; value: string }>;
    sources: EvidenceSource[];
    skills: string[];
    blockers: string[];
  };
  resumes?: ResumeArtifact[];
  operations?: {
    goalLabel: string;
    completed: number;
    target: number;
    activeWorkers: number;
    reviews: ReviewItem[];
  };
  opportunities?: Opportunity[];
  connections?: Connection[];
  recommendations?: Array<{ title: string; detail: string; evidenceIds: string[] }>;
  diagnostics?: unknown;
};

export interface ProductRepository {
  readonly provider: ProductProvider;
  read(view: ProductView, userId: string): Promise<ProductViewData>;
}

export function isProductView(value: string): value is ProductView {
  return productViews.includes(value as ProductView);
}
