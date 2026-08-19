export type CapabilityState = "available" | "read_only" | "locked";

export type CapabilityKey =
  | "connections"
  | "evidence_read"
  | "evidence_write"
  | "evidence_scrape"
  | "resume_read"
  | "resume_generate"
  | "analytics_read"
  | "analytics_write"
  | "job_discovery"
  | "application_draft";

export type Capability = {
  state: CapabilityState;
  reason: string;
  missing: string[];
};

export type CapabilityManifest = {
  developmentOwner: boolean;
  localDemo: boolean;
  authenticatedUser?: boolean;
  capabilities: Record<CapabilityKey, Capability>;
};

type CapabilityInputs = {
  developmentOwner: boolean;
  authenticatedUser?: boolean;
  identityConnected: boolean;
  socialConnected: boolean;
  jobSiteConnected: boolean;
  evidenceReady: boolean;
  normalizedProfileReady: boolean;
  resumeArtifactsReady: boolean;
  visualDemo?: boolean;
  localDemo?: boolean;
};

const locked = (reason: string, missing: string[] = []): Capability => ({ state: "locked", reason, missing });
const available = (reason: string): Capability => ({ state: "available", reason, missing: [] });
const readOnly = (reason: string): Capability => ({ state: "read_only", reason, missing: [] });

export function buildCapabilityManifest(input: CapabilityInputs): CapabilityManifest {
  const canOwnCareerData = input.developmentOwner || input.authenticatedUser === true;
  const ownerRequired = locked("Available only in the authorized local development session.", ["development owner session"]);
  const connections = canOwnCareerData
    ? available("Local connection status is available without exposing credentials or session contents.")
    : ownerRequired;
  const evidenceRead = input.evidenceReady
    ? readOnly("Normalized career evidence is available for inspection.")
    : input.visualDemo
      ? readOnly("Read-only prototype evidence is enabled; collection and generation remain locked.")
    : locked("No normalized career evidence is available yet.", ["normalized evidence"]);
  const evidenceScrape = !input.developmentOwner
    ? ownerRequired
    : input.identityConnected || input.socialConnected
      ? available("An approved local source session is available for evidence collection.")
      : locked("Connect an approved identity or social source before collecting evidence.", ["approved source session"]);
  const evidenceWrite = canOwnCareerData
    ? available("You may create and approve your own career evidence through the server gateway.")
    : ownerRequired;
  const resumeRead = input.resumeArtifactsReady
    ? readOnly("Existing generated resume artifacts are available for review.")
    : input.visualDemo
      ? readOnly("Read-only prototype resume cards are enabled; no artifact can be uploaded or used.")
    : locked("No generated resume artifact is available.", ["generated resume artifact"]);
  const resumeGenerate = !input.developmentOwner
    ? ownerRequired
    : input.normalizedProfileReady
      ? available("Resume generation may consume the normalized middleman profile.")
      : locked("Run the evidence middleman before generating a resume.", ["middleman-produced user_profile.json"]);
  const jobDiscovery = !input.developmentOwner
    ? ownerRequired
    : input.jobSiteConnected
      ? available("The verified local job-site browser session is connected.")
      : input.visualDemo
        ? readOnly("Prototype opportunities are viewable; live discovery remains locked until a job-site session is verified.")
      : locked("Open and verify the approved job-site browser session first.", ["verified job-site session"]);
  const applicationDraft = !input.developmentOwner
    ? ownerRequired
    : !input.jobSiteConnected
      ? locked("A verified job-site session is required before application drafting.", ["verified job-site session"])
      : !input.resumeArtifactsReady
        ? locked("A real generated resume artifact is required before application drafting.", ["generated resume artifact"])
        : available("Draft-safe automation is available; all existing human gates remain enforced.");

  return {
    developmentOwner: input.developmentOwner,
    localDemo: input.localDemo === true,
    capabilities: {
      connections,
      evidence_read: evidenceRead,
      evidence_write: evidenceWrite,
      evidence_scrape: evidenceScrape,
      resume_read: resumeRead,
      resume_generate: resumeGenerate,
      analytics_read: readOnly("Analytics may query existing snapshots with local filters."),
      analytics_write: locked("Browser analytics is read-only; refresh and import belong to controlled backend ingestion."),
      job_discovery: jobDiscovery,
      application_draft: applicationDraft,
    },
  };
}

export const lockedCapabilityManifest = () => buildCapabilityManifest({
  developmentOwner: false,
  authenticatedUser: false,
  identityConnected: false,
  socialConnected: false,
  jobSiteConnected: false,
  evidenceReady: false,
  normalizedProfileReady: false,
  resumeArtifactsReady: false,
  localDemo: false,
});
