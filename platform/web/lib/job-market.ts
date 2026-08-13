export type WorkMode = "remote" | "hybrid" | "onsite" | "any" | "unknown";

export type SourceStatus = {
  id: string;
  label: string;
  kind: "live_api" | "annual_dataset" | "official_series" | "import";
  configured: boolean;
  geography: string;
  freshness: string;
  attribution_url: string;
  note?: string;
};

export type JobMarketSummary = {
  query: { countries: string[]; role_family: string; work_mode: WorkMode; days: number };
  generated_at: string;
  snapshot_kind: "live" | "cached" | "synthetic_demo";
  sample_size: number;
  unknown_degree_count: number;
  unknown_experience_count: number;
  sources: SourceStatus[];
  hiring_layoff_series: Array<Record<string, string | number | null>>;
  skill_demand: Array<{ skill: string; postings: number; evidenced: boolean }>;
  qualification_barriers: Array<{ label: string; count: number; percent: number }>;
  geography_ratios: Array<{ country: string; mode: string; count: number; percent: number }>;
  personal_comparison: Array<{ skill: string; postings: number; evidenced: boolean }>;
  salary_bands: Array<Record<string, string | number>>;
  funnel: Array<Record<string, string | number | null>>;
  warnings: string[];
};

export const fallbackMarketSummary: JobMarketSummary = {
  query: { countries: ["Philippines"], role_family: "software", work_mode: "any", days: 90 },
  generated_at: "2026-08-13T00:00:00Z",
  snapshot_kind: "synthetic_demo",
  sample_size: 5,
  unknown_degree_count: 5,
  unknown_experience_count: 5,
  sources: [
    { id: "adzuna", label: "Adzuna", kind: "live_api", configured: false, geography: "Supported countries", freshness: "Requires API credentials", attribution_url: "https://developer.adzuna.com/overview" },
    { id: "remotive", label: "Remotive", kind: "live_api", configured: true, geography: "Global remote", freshness: "Public feed delayed by 24 hours", attribution_url: "https://remotive.com/remote-jobs/api" },
    { id: "stackoverflow", label: "Stack Overflow Survey", kind: "annual_dataset", configured: false, geography: "Global respondents", freshness: "Annual import", attribution_url: "https://survey.stackoverflow.co/" },
    { id: "onet", label: "O*NET", kind: "official_series", configured: false, geography: "United States occupations", freshness: "Versioned taxonomy", attribution_url: "https://services.onetcenter.org/" },
    { id: "bls", label: "BLS / JOLTS", kind: "official_series", configured: false, geography: "United States", freshness: "Monthly series", attribution_url: "https://www.bls.gov/developers/home.htm" }
  ],
  hiring_layoff_series: [{ period: "Current snapshot", active_postings: 5, layoffs: null, geography: "Philippines" }],
  skill_demand: [
    { skill: "Python", postings: 3, evidenced: true }, { skill: "Git", postings: 2, evidenced: true },
    { skill: "TypeScript", postings: 2, evidenced: false }, { skill: "React", postings: 1, evidenced: true },
    { skill: "Docker", postings: 2, evidenced: false }, { skill: "AWS", postings: 2, evidenced: false }
  ],
  qualification_barriers: [
    { label: "Completed degree required", count: 0, percent: 0 },
    { label: "Degree requirement unknown", count: 5, percent: 100 },
    { label: "2+ years experience", count: 0, percent: 0 },
    { label: "Experience requirement unknown", count: 5, percent: 100 }
  ],
  geography_ratios: [
    { country: "Philippines", mode: "remote", count: 2, percent: 40 },
    { country: "Philippines", mode: "hybrid", count: 2, percent: 40 },
    { country: "Philippines", mode: "onsite", count: 1, percent: 20 }
  ],
  personal_comparison: [], salary_bands: [], funnel: [],
  warnings: ["Backend unavailable; a versioned synthetic demonstration is shown.", "Unknown requirements are not treated as absent requirements."]
};
