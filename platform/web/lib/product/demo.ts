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
      { id: "github", label: "GitHub", kind: "Projects and contributions", status: "verified" as const, maturity: "available" as const, connectionStatus: "connected" as const, connectionMethod: "website_session" as const, description: "Website-first project evidence using cached, layout-scoped extraction rules.", permissions: ["Read public projects", "Read contribution metadata"], evidenceCount: 4, lastSyncedAt: "2026-08-14T02:35:00Z" },
      { id: "linkedin", label: "LinkedIn", kind: "Professional profile and posts", status: "ready" as const, maturity: "available" as const, connectionStatus: "connected" as const, connectionMethod: "website_session" as const, description: "Uses a user-approved visible browser session and stops when verification is required.", permissions: ["Read visible profile", "Read selected posts"], evidenceCount: 2, lastSyncedAt: "2026-08-12T08:20:00Z" },
      { id: "facebook", label: "Facebook", kind: "Selected public posts", status: "blocked" as const, maturity: "available" as const, connectionStatus: "verification_required" as const, connectionMethod: "website_session" as const, description: "Collection pauses at login, CAPTCHA, or account verification.", permissions: ["Read user-selected posts"], evidenceCount: 0, lastSyncedAt: null },
      { id: "twitter", label: "Twitter / X", kind: "Public posts", status: "ready" as const, maturity: "beta" as const, connectionStatus: "disconnected" as const, connectionMethod: "website_session" as const, description: "Beta adapter with bounded DOM sampling and deterministic rule replay.", permissions: ["Read selected public posts"], evidenceCount: 0, lastSyncedAt: null },
      { id: "instagram", label: "Instagram", kind: "Public portfolio posts", status: "ready" as const, maturity: "beta" as const, connectionStatus: "disconnected" as const, connectionMethod: "website_session" as const, description: "Beta adapter; challenged sessions always require human completion.", permissions: ["Read selected public posts"], evidenceCount: 0, lastSyncedAt: null },
      { id: "website", label: "Generic website", kind: "Portfolio or project URL", status: "ready" as const, maturity: "experimental" as const, connectionStatus: "disconnected" as const, connectionMethod: "url" as const, description: "AI plans strict rules from a bounded rendered-DOM inventory, then code replays them.", permissions: ["Read the submitted URL"], evidenceCount: 0, lastSyncedAt: null },
      { id: "upload", label: "Photos & documents", kind: "Private uploads", status: "verified" as const, maturity: "available" as const, connectionStatus: "connected" as const, connectionMethod: "upload" as const, description: "Private evidence selected by the user. AI analysis requires approval every time.", permissions: ["Store selected files privately"], evidenceCount: 3, lastSyncedAt: "2026-08-14T03:05:00Z" },
      { id: "manual", label: "Manual entry", kind: "User-authored evidence", status: "verified" as const, maturity: "available" as const, connectionStatus: "connected" as const, connectionMethod: "manual" as const, description: "The user remains the source of truth and can revise any normalized achievement.", permissions: ["Save user-entered evidence"], evidenceCount: 1, lastSyncedAt: "2026-08-14T03:12:00Z" },
    ],
    skills: ["Python", "PyTorch", "React", "FastAPI", "SQL"],
    blockers: ["Connect a user-approved social session to collect additional evidence."],
    items: [
      {
        id: "evidence-ml-showcase", sourceId: "github", title: "Presented an ML project at a campus showcase", organization: "University Innovation Lab", role: "Machine Learning Developer", dateLabel: "March 2026", mediaUrl: "/demo/evidence/ml-showcase.webp", mediaAlt: "Synthetic demo photo of a student presenting a machine-learning project", verificationState: "user_verified" as const, confidence: 96,
        description: "Built and presented an image-classification prototype, explaining the training workflow and evaluation results to a mixed technical audience.", quantitative: ["Evaluated the prototype on 1,200 labelled images from the approved project dataset."], qualitative: ["Translated model behavior into a clear demonstration for students and faculty."], skills: ["Python", "PyTorch", "Computer Vision"], sourceUrl: "https://github.com/example/campus-vision-demo",
      },
      {
        id: "evidence-workshop", sourceId: "linkedin", title: "Facilitated a hands-on programming workshop", organization: "AI Study Circles", role: "Workshop Facilitator", dateLabel: "May 2026", mediaUrl: "/demo/evidence/workshop-facilitation.webp", mediaAlt: "Synthetic demo photo of a student facilitating a programming workshop", verificationState: "ai_proposed" as const, confidence: 88,
        description: "Guided participants through a practical model-training exercise and helped resolve setup and debugging issues.", quantitative: [], qualitative: ["Helped participants complete the exercise by breaking down environment and training-loop errors."], skills: ["Python", "Teaching", "PyTorch"],
        aiProposal: { summary: "The selected photo and source text support a facilitation achievement, but do not prove attendance counts.", changes: [{ field: "Description", before: "Helped in a coding workshop.", after: "Facilitated a hands-on model-training workshop and resolved participant setup issues." }, { field: "Skills", before: "Python", after: "Python, PyTorch, Teaching" }], warnings: ["No verified participant count was found; no metric was added."] },
      },
      {
        id: "evidence-hackathon", sourceId: "upload", title: "Completed an ethical AI hackathon prototype", organization: "Campus AI Hack Night", role: "Prototype Team Member", dateLabel: "July 2026", mediaUrl: "/demo/evidence/hackathon-team.webp", mediaAlt: "Synthetic demo photo of a student team celebrating a prototype", verificationState: "source_matched" as const, confidence: 91,
        description: "Collaborated on a working sensor prototype and documented its intended use, limitations, and data-handling constraints.", quantitative: [], qualitative: ["Connected the prototype implementation with an explicit responsible-use review."], skills: ["Teamwork", "Prototyping", "Data Ethics"],
      },
    ],
  },
  resumes: [
    { id: "software-systems", label: "Software Systems", summary: "Backend, web, and automation evidence.", skillGroupCount: 4, projectCount: 5, ready: true, formats: [] },
    { id: "machine-learning", label: "Machine Learning", summary: "PyTorch, data, and model-development evidence.", skillGroupCount: 3, projectCount: 4, ready: true, formats: [] },
  ],
  resumeProfile: {
    fullName: "Alex Rivera", headline: "Software & Machine Learning Developer", email: "alex.rivera@example.test", location: "Metro Manila, Philippines", summary: "Developer focused on evidence-backed machine-learning products, reliable web systems, and practical technical education.",
    experience: [{ title: "Workshop Facilitator", organization: "AI Study Circles", dateLabel: "May 2026", bullets: ["Facilitated a hands-on model-training workshop and resolved participant setup issues."] }],
    projects: [{ title: "Campus Vision Demo", summary: "Image-classification prototype presented to a mixed technical audience.", bullets: ["Evaluated the prototype on 1,200 labelled images from the approved project dataset.", "Explained the training workflow and evaluation results during a campus showcase."] }, { title: "Responsible Sensor Prototype", summary: "Collaborative hackathon prototype with documented limitations and data-handling constraints.", bullets: ["Connected implementation decisions with an explicit responsible-use review."] }],
    skillGroups: [{ name: "Python", items: ["PyTorch", "FastAPI"] }, { name: "JavaScript", items: ["React", "Next.js"] }, { name: "Data", items: ["PostgreSQL", "Supabase"] }],
    education: [{ school: "FEU Institute of Technology", program: "BS Computer Science", dateLabel: "Expected 2027" }],
  },
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
    { id: "linkedin", label: "LinkedIn evidence", category: "social" as const, status: "connected" as const, detail: "User-approved visible session; read-only evidence collection." },
    { id: "facebook", label: "Facebook evidence", category: "social" as const, status: "verification_required" as const, detail: "Open a visible browser and complete verification before collection." },
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
