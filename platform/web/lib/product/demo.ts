import type { ProductView, ProductViewData } from "./contracts";
import { activityTrend, approvalQueue, departmentLoad, kanbanEvents, leaderboardRows, metrics, skillRadar, systemHealth } from "../mock-data";

const common = {
  evidence: {
    ready: true,
    phase: "ready",
    profileFacts: [
      { label: "Profile", value: "Development candidate" },
      { label: "Target", value: "Software and ML roles" },
      { label: "Evidence policy", value: "Verified sources only" },
    ],
    sources: [
      { id: "demo-github", label: "GitHub projects", kind: "project", status: "verified" as const },
      { id: "demo-document", label: "Approved resume document", kind: "document", status: "ready" as const },
      { id: "demo-social", label: "Social evidence", kind: "post", status: "blocked" as const },
    ],
    skills: ["Python", "PyTorch", "React", "FastAPI", "SQL"],
    blockers: ["Connect a user-approved social session to collect additional evidence."],
  },
  resumes: [
    { id: "software-systems", label: "Software Systems", summary: "Backend, web, and automation evidence.", skillGroupCount: 4, projectCount: 5, ready: true, formats: [] },
    { id: "machine-learning", label: "Machine Learning", summary: "PyTorch, data, and model-development evidence.", skillGroupCount: 3, projectCount: 4, ready: true, formats: [] },
  ],
  operations: {
    goalLabel: "Reviewed applications",
    completed: 3,
    target: 10,
    activeWorkers: 0,
    reviews: [
      { id: "review-1", title: "Resume selection", detail: "Confirm the role-specific artifact before upload.", state: "waiting", humanGate: true },
      { id: "review-2", title: "Job-site verification", detail: "A visible browser session must be verified by the user.", state: "blocked", humanGate: true },
    ],
  },
  opportunities: [
    { id: "opp-1", company: "Sample Technology Team", title: "Junior Software Engineer", location: "Remote", workMode: "remote", stage: "review", fit: 78 },
    { id: "opp-2", company: "Example AI Lab", title: "Machine Learning Intern", location: "Makati", workMode: "hybrid", stage: "discovered", fit: 71 },
  ],
  connections: [
    { id: "supabase", label: "Supabase", category: "database" as const, status: "disconnected" as const, detail: "Configure production environment variables." },
    { id: "github", label: "GitHub", category: "identity" as const, status: "connected" as const, detail: "Approved development fixture." },
    { id: "indeed", label: "Indeed", category: "job_site" as const, status: "verification_required" as const, detail: "Human verification required before automation." },
  ],
};

const headings: Record<ProductView, ProductViewData["heading"]> = {
  dashboard: { eyebrow: "Career command center", title: "Your career system, at a glance.", description: "Verified evidence, role-specific resumes, market signals, and permission-gated job operations." },
  "career-evidence": { eyebrow: "Normalized career database", title: "Career Evidence", description: "Trace approved sources through the retrieval middleman into reusable, verified career facts." },
  resumes: { eyebrow: "Generated outputs", title: "Resume Studio", description: "Review role-specific artifacts generated from the normalized career database." },
  "job-operations": { eyebrow: "Human-gated execution", title: "Job Automation", description: "Monitor safe work, explicit goals, and every item waiting for your approval." },
  opportunities: { eyebrow: "Evidence-backed market fit", title: "Opportunities & Interviews", description: "Review roles, qualification signals, and funnel progress without inventing missing evidence." },
  connections: { eyebrow: "Access and identity", title: "Connections & Sessions", description: "See sanitized connection health without exposing credentials, cookies, or browser state." },
  advisor: { eyebrow: "Grounded recommendations", title: "Career Advisor", description: "Recommendations must cite normalized evidence and abstain when support is missing." },
};

export function demoProductView(view: ProductView): ProductViewData {
  return {
    meta: { source: "demo", provider: "local", generatedAt: new Date().toISOString(), label: "Prototype data" },
    heading: headings[view],
    stats: [
      { label: "Verified sources", value: "2", detail: "Middleman-approved inputs" },
      { label: "Resume artifacts", value: "2", detail: "Ready for human review" },
      { label: "Opportunities", value: "2", detail: "No automatic submission" },
      { label: "Human gates", value: "2", detail: "Permission still required" },
    ],
    ...common,
    analytics: {
      metrics: { state: "demo", data: metrics.map((item) => ({ ...item, trend: item.trend === "up" ? "up" as const : "down" as const })) },
      activity: { state: "demo", data: activityTrend },
      trust: { state: "demo", data: systemHealth.map((item) => ({ ...item, tone: item.tone === "good" ? "good" as const : item.tone === "warn" ? "warn" as const : "info" as const })) },
      departments: { state: "demo", data: departmentLoad },
      events: { state: "demo", data: kanbanEvents },
      approvals: { state: "demo", data: approvalQueue.map((item, index) => ({ id: `demo-approval-${index + 1}`, ...item })) },
      leaderboard: { state: "demo", data: leaderboardRows },
      skills: { state: "demo", data: skillRadar },
    },
    recommendations: [
      { title: "Strengthen deployment evidence", detail: "Add a verified production outcome before claiming operational experience.", evidenceIds: ["demo-github"] },
      { title: "Keep role variants focused", detail: "Use the ML artifact only where the job description contains evidenced model-development requirements.", evidenceIds: ["demo-document"] },
    ],
  };
}
