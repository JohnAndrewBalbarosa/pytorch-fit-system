import type { Step } from "react-joyride";

export type ProductTour = {
  version: number;
  steps: Step[];
};

const serviceSteps = (purpose: string): Step[] => [
  {
    target: '[data-tour="page-heading"]',
    title: "What this page does",
    content: purpose,
    placement: "bottom-start"
  },
  {
    target: '[data-tour="permission-boundary"]',
    title: "Safety comes first",
    content: "Read this boundary before acting. Developer access never removes verification or human-approval gates."
  },
  {
    target: '[data-tour="page-content"]',
    title: "Visual system state",
    content: "Focused cards expose live, presentation-ready data. Empty and error states remain visible instead of being guessed."
  }
];

export const productTours: Record<string, ProductTour> = {
  "/dashboard": {
    version: 3,
    steps: [
      { target: '[data-tour="dashboard-overview"]', title: "Your command center", content: "Start here for chapter operations, analytics availability, pipeline health, and current risks.", placement: "bottom-start" },
      { target: '[data-tour="dashboard-metrics"]', title: "Cycle metrics", content: "Live data is shown when available. Missing data keeps the same visual footprint with a clear watermark." },
      { target: '[data-tour="dashboard-activity"]', title: "Activity pulse", content: "The line and area chart preserves its axes and dimensions even when its source is unavailable." },
      { target: '[data-tour="dashboard-trust"]', title: "Trust boundary", content: "Safety indicators keep privacy and human review visible before work is dispatched." },
      { target: '[data-tour="dashboard-approvals"]', title: "Approval middleman", content: "AI-assisted outputs remain human-gated; unavailable data never becomes a fabricated queue." },
      { target: '[data-tour="dashboard-career"]', title: "Career workspace", content: "Career readiness and destination cards are appended after the original operations dashboard." }
    ]
  },
  "/career/evidence": { version: 1, steps: serviceSteps("Review the verified profile, source artifacts, and any evidence blockers before generating career outputs.") },
  "/career/resumes": { version: 1, steps: serviceSteps("Browse role-specific resumes generated from normalized career evidence rather than treating a PDF as the source of truth.") },
  "/jobs/analytics": {
    version: 1,
    steps: [
      { target: '[data-tour="analytics-heading"]', title: "Evidence-backed market view", content: "This dashboard compares observed job demand with your verified career evidence. Unknown requirements stay unknown.", placement: "bottom-start" },
      { target: '[data-tour="analytics-filters"]', title: "Choose a comparable market", content: "Filter by country, optional comparison country, role family, and work mode before interpreting the charts." },
      { target: '[data-tour="analytics-market"]', title: "Hiring and market coverage", content: "Active postings and layoffs are separate descriptive series. Only compare them when their geography and period are compatible." },
      { target: '[data-tour="analytics-evidence"]', title: "Evidence and gaps", content: "Skills are marked present only when the normalized profile contains evidence. Everything else is a gap to review, not an assumption." },
      { target: '[data-tour="analytics-sources"]', title: "Check provenance", content: "Always review source, freshness, geography, sample size, and limitations before acting on a trend." }
    ]
  },
  "/jobs/automation": { version: 1, steps: serviceSteps("Monitor job goals, automatic browser work, human interventions, and safe recovery without weakening application gates.") },
  "/jobs/opportunities": { version: 1, steps: serviceSteps("Track verified job requirements, fit assessments, funnel outcomes, and evidence-grounded interview preparation.") },
  "/connections": { version: 1, steps: serviceSteps("Inspect identity providers and approved browser sessions without exposing credentials, cookies, or storage contents.") },
  "/events": {
    version: 1,
    steps: [
      { target: '[data-tour="events-heading"]', title: "Chapter events", content: "Browse workshops, clinics, hackathons, and other chapter activities from one view.", placement: "bottom-start" },
      { target: '[data-tour="events-role"]', title: "Preview access tiers", content: "This prototype selector demonstrates how event access labels change by member tier." },
      { target: '[data-tour="events-grid"]', title: "Read event availability", content: "Each card shows the department, date, activity type, seats, and the applicable access label." }
    ]
  },
  "/leaderboards": {
    version: 1,
    steps: [
      { target: '[data-tour="leaderboards-heading"]', title: "Public-safe rankings", content: "Leaderboards use reviewed signals and public-safe handles instead of exposing private student information.", placement: "bottom-start" },
      { target: '[data-tour="leaderboards-tabs"]', title: "Change the ranking view", content: "Switch between the global board and specialist categories without leaving the page." },
      { target: '[data-tour="leaderboards-table"]', title: "Understand each rank", content: "Compare points, event streaks, tracks, and reviewed skill badges in this table." }
    ]
  },
  "/settings": {
    version: 1,
    steps: [
      { target: '[data-tour="settings-heading"]', title: "System settings", content: "Account, credentials, notifications, and privacy controls live in one place.", placement: "bottom-start" },
      { target: '[data-tour="settings-grid"]', title: "Configure by section", content: "Each card groups related fields so you can review one concern at a time." },
      { target: '[data-tour="settings-privacy"]', title: "Privacy by default", content: "Public profile fields, social parsing consent, and analytics sharing must remain explicit choices." }
    ]
  }
};

export function tourStorageKey(pathname: string, version: number): string {
  return `pytorch-fit:tour:${pathname}:v${version}`;
}
