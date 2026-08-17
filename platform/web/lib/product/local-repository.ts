import type { Connection, ProductRepository, ProductView, ProductViewData } from "./contracts";
import { unavailableDashboardAnalytics } from "./contracts";
import { sourcesWithConnectionState } from "./source-catalog";
import { overlayLocalCareerState } from "./local-career-store";

type JsonObject = Record<string, unknown>;

const headings: Record<ProductView, ProductViewData["heading"]> = {
  dashboard: { eyebrow: "Career command center", title: "Your career system, at a glance.", description: "Verified evidence, resumes, opportunities, and permission-gated automation from the live local services." },
  "career-evidence": { eyebrow: "Normalized career database", title: "Career Evidence", description: "Approved inputs pass through one retrieval middleman before becoming reusable career facts." },
  resumes: { eyebrow: "Generated outputs", title: "Resume Studio", description: "Role-specific artifacts generated from normalized career evidence." },
  "job-operations": { eyebrow: "Human-gated execution", title: "Job Automation", description: "Live goals, safe browser work, and intervention queues from the local runtime." },
  opportunities: { eyebrow: "Evidence-backed market fit", title: "Opportunities & Interviews", description: "Verified job demands, fit assessments, and funnel outcomes." },
  connections: { eyebrow: "Access and identity", title: "Connections & Sessions", description: "Sanitized provider health without credentials or session contents." },
  advisor: { eyebrow: "Grounded recommendations", title: "Career Advisor", description: "Career guidance limited to normalized, cited evidence." },
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export class LocalProductRepository implements ProductRepository {
  readonly provider = "local" as const;
  private readonly baseUrl = process.env.PYTORCH_FIT_API_URL || "http://127.0.0.1:8000";

  private async fetchJson(path: string): Promise<JsonObject> {
    const response = await fetch(`${this.baseUrl}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Local service ${path} returned ${response.status}.`);
    return object(await response.json());
  }

  async read(view: ProductView, userId: string): Promise<ProductViewData> {
    const [onboarding, resumesResponse, control, market, auth] = await Promise.all([
      this.fetchJson("/api/onboarding/state"),
      this.fetchJson("/api/resumes"),
      this.fetchJson("/api/job-finder/control-state"),
      this.fetchJson("/api/job-finder/market-fit"),
      this.fetchJson("/api/auth/status"),
    ]);
    const source = object(onboarding.source);
    const profile = object(onboarding.profile);
    const resumeSource = list(source.resumes);
    const artifactResumes = list(resumesResponse.items);
    const resumeByRole = new Map(artifactResumes.map((item) => [text(object(item).role_id), object(item)]));
    const resumes = resumeSource.map((item, index) => {
      const value = object(item);
      const roleId = text(value.role_id, `resume-${index + 1}`);
      const artifact = resumeByRole.get(roleId) || {};
      const formats = object(artifact.formats);
      return {
        id: roleId,
        label: text(value.label, roleId.replaceAll("-", " ")),
        summary: text(value.summary, "Generated from normalized career evidence."),
        skillGroupCount: count(value.skill_group_count),
        projectCount: count(value.project_count),
        ready: Boolean(value.artifact_ready),
        formats: Object.entries(formats).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([label, url]) => ({ label: label.toUpperCase(), url })),
      };
    });
    const sessions = object(control.sessions);
    const jobSites = object(sessions.job_sites);
    const identity = object(auth.identity);
    const social = object(auth.social);
    const connections: Connection[] = [
      ...Object.entries(identity).map(([id, raw]) => this.connection(id, raw, "identity")),
      ...Object.entries(social).map(([id, raw]) => this.connection(id, raw, "social")),
      ...Object.entries(jobSites).map(([id, raw]) => this.connection(id, raw, "job_site")),
      { id: "local-data", label: "Local data gateway", category: "database", status: "connected", detail: "FastAPI and local persistence are reachable." },
    ];
    const campaign = object(market.campaign);
    const analytics = object(market.analytics);
    const opportunities = list(market.opportunities).map((item, index) => {
      const value = object(item);
      const fitAssessment = object(value.fit_assessment);
      return {
        id: text(value.id, `opportunity-${index + 1}`),
        company: text(value.company, "Unknown company"),
        title: text(value.job_title, "Untitled role"),
        location: text(value.location, text(value.source_domain, "Location unavailable")),
        workMode: text(value.work_mode, "unknown"),
        stage: text(value.stage, text(value.funnel_stage, "discovered")),
        fit: typeof fitAssessment.score === "number" ? fitAssessment.score : null,
      };
    });
    const reviews = list(control.human_queue ?? control.interventions ?? control.review_queue).map((item, index) => {
      const value = object(item);
      return { id: text(value.id, `review-${index + 1}`), title: text(value.title, text(value.reason, "Human review required")), detail: text(value.detail, text(value.message, "Review this item before execution continues.")), state: text(value.state, "waiting"), humanGate: true };
    });
    const goals = list(control.goals);
    const firstGoal = object(goals[0]);
    const blockers = list(source.errors).map((item) => text(item)).filter(Boolean);
    const skills = list(profile.skills).map((item) => typeof item === "string" ? item : text(object(item).name)).filter(Boolean);
    const data: ProductViewData = {
      meta: { source: "live", provider: "local", generatedAt: new Date().toISOString(), label: "Live local data" },
      heading: headings[view],
      stats: [
        { label: "Evidence sources", value: String(count(source.resume_count) + (source.master_loaded ? 1 : 0)), detail: onboarding.ready ? "Normalized profile ready" : "Setup still has blockers" },
        { label: "Resume artifacts", value: String(resumes.filter((item) => item.ready).length), detail: "Role-specific outputs" },
        { label: "Opportunities", value: String(opportunities.length), detail: "Persisted market records" },
        { label: "Human reviews", value: String(reviews.length), detail: "Never auto-approved" },
      ],
      evidence: {
        ready: Boolean(onboarding.ready),
        phase: text(onboarding.phase, "unknown"),
        profileFacts: Object.entries(profile).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 8).map(([label, value]) => ({ label: label.replaceAll("_", " "), value: String(value) })),
        sources: sourcesWithConnectionState(connections, source.master_loaded ? 1 : 0),
        skills,
        blockers,
      },
      resumes,
      operations: {
        goalLabel: text(firstGoal.label, text(campaign.name, "Application goal")),
        completed: count(firstGoal.confirmed_count ?? firstGoal.completed),
        target: count(firstGoal.target) || count(campaign.target) || 0,
        activeWorkers: count(control.active_workers),
        reviews,
      },
      opportunities,
      connections,
      recommendations: blockers.length ? [{ title: "Resolve the current evidence blocker", detail: blockers[0], evidenceIds: [] }] : [],
      analytics: unavailableDashboardAnalytics(),
      ...(process.env.NODE_ENV === "development" ? { diagnostics: { onboarding, control, market } } : {}),
    };
    return overlayLocalCareerState(data, userId);
  }

  private connection(id: string, raw: unknown, category: Connection["category"]): Connection {
    const value = object(raw);
    const connected = Boolean(value.connected);
    const requiresVerification = Boolean(value.verification_required ?? value.requires_verification);
    return {
      id,
      label: text(value.label, id.replaceAll("_", " ")),
      category,
      status: connected ? "connected" : requiresVerification ? "verification_required" : "disconnected",
      detail: connected ? "Approved session is available." : requiresVerification ? "Human verification is required." : "Not connected.",
    };
  }
}
