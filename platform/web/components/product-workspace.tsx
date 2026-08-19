"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Database,
  FileCheck2,
  FileText,
  GitBranch,
  LockKeyhole,
  Network,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  Unplug,
  UserCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CareerEvidenceView, ConnectionsWorkspaceView, ResumeStudioView } from "@/components/career-product-views";
import { CapabilityGate, CapabilityStatus } from "@/components/capability-gate";
import { useCapability } from "@/components/capability-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CapabilityKey } from "@/lib/capabilities";
import type { ProductView, ProductViewData } from "@/lib/product/contracts";

type Props = { view: ProductView; capabilityKey: CapabilityKey; safety: string };

function SourceBadge({ data }: { data: ProductViewData }) {
  return <Badge variant={data.meta.source === "live" ? "success" : "orange"}><Database size={13} />{data.meta.label}</Badge>;
}

function Header({ data, capabilityKey }: { data: ProductViewData; capabilityKey: CapabilityKey }) {
  return <header className="mb-6 flex flex-wrap items-start justify-between gap-4" data-tour="page-heading">
    <div><p className="data-label mb-2 text-xs uppercase tracking-widest text-accent">{data.heading.eyebrow}</p><h1 className="text-3xl font-bold tracking-[-0.02em]">{data.heading.title}</h1><p className="mt-2 max-w-3xl leading-7 text-muted">{data.heading.description}</p></div>
    <div className="flex flex-wrap gap-2" data-tour="service-status"><CapabilityStatus capabilityKey={capabilityKey} /><SourceBadge data={data} /></div>
  </header>;
}

function Stats({ data }: { data: ProductViewData }) {
  return <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.stats.map((item) => <Card className="bg-surface" key={item.label}><p className="text-sm text-muted">{item.label}</p><p className="data-label mt-3 text-3xl font-bold">{item.value}</p><p className="mt-2 text-xs text-muted">{item.detail}</p></Card>)}</section>;
}

function EvidenceView({ data }: { data: ProductViewData }) {
  const evidence = data.evidence;
  if (!evidence) return <Empty title="No evidence view is available" />;
  const steps = [
    { label: "Approved sources", icon: FileText },
    { label: "Retrieval middleman", icon: GitBranch },
    { label: "Normalize + verify", icon: Network },
    { label: "Career database", icon: Database },
  ];
  return <div className="space-y-4">
    <Card className="overflow-hidden border-accent/25 bg-accentSoft">
      <CardHeader><div><CardTitle>Evidence pipeline</CardTitle><CardDescription>Every source follows one controlled route; generated resumes never become source evidence.</CardDescription></div><ShieldCheck className="text-accent" size={20} /></CardHeader>
      <div className="grid gap-2 md:grid-cols-4">{steps.map(({ label, icon: Icon }, index) => <div className="relative rounded-lg border border-border bg-surface p-4" key={label}><div className="mb-3 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft text-accent"><Icon size={18} /></span>{index < steps.length - 1 && <ArrowRight className="hidden text-muted md:block" size={16} />}</div><p className="text-sm font-semibold">{label}</p></div>)}</div>
    </Card>
    <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="bg-surface"><CardHeader><div><CardTitle>Source inventory</CardTitle><CardDescription>Status is evidence-specific, not a login shortcut.</CardDescription></div><Badge variant={evidence.ready ? "success" : "warning"}>{evidence.phase}</Badge></CardHeader><div className="space-y-2">{evidence.sources.length ? evidence.sources.map((source) => <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated p-3" key={source.id}><div><p className="font-semibold">{source.label}</p><p className="mt-1 text-xs text-muted">{source.kind}</p></div><Badge variant={source.status === "blocked" ? "warning" : "success"}>{source.status}</Badge></div>) : <EmptyInline text="No approved sources have been added." />}</div></Card>
      <Card className="bg-surface"><CardHeader><div><CardTitle>Verified profile</CardTitle><CardDescription>Only compact normalized facts are exposed here.</CardDescription></div><UserCheck className="text-accent" size={20} /></CardHeader><div className="grid gap-2 sm:grid-cols-2">{evidence.profileFacts.length ? evidence.profileFacts.map((fact) => <div className="rounded-lg border border-border bg-elevated p-3" key={`${fact.label}-${fact.value}`}><p className="text-xs capitalize text-muted">{fact.label}</p><p className="mt-2 break-words text-sm font-semibold">{fact.value}</p></div>) : <EmptyInline text="No verified profile facts yet." />}</div>{evidence.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{evidence.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div>}</Card>
    </section>
    {evidence.blockers.length > 0 && <Card className="border-warning/30 bg-warning/10"><CardHeader><div><CardTitle>Evidence blockers</CardTitle><CardDescription>These require a real source or human action.</CardDescription></div><AlertTriangle className="text-warning" size={20} /></CardHeader><ul className="space-y-2 text-sm">{evidence.blockers.map((item) => <li className="flex gap-2" key={item}><CircleDot className="mt-1 flex-none text-warning" size={13} />{item}</li>)}</ul></Card>}
  </div>;
}

function ResumeView({ data }: { data: ProductViewData }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.resumes?.length ? data.resumes.map((resume) => <Card className="flex flex-col bg-surface" key={resume.id}><CardHeader><div><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accentSoft text-accent"><FileCheck2 size={20} /></div><CardTitle>{resume.label}</CardTitle><CardDescription>{resume.summary}</CardDescription></div><Badge variant={resume.ready ? "success" : "warning"}>{resume.ready ? "Ready" : "Incomplete"}</Badge></CardHeader><div className="mt-auto grid grid-cols-2 gap-2"><div className="rounded-lg bg-elevated p-3"><p className="data-label text-xl font-bold">{resume.skillGroupCount}</p><p className="text-xs text-muted">skill groups</p></div><div className="rounded-lg bg-elevated p-3"><p className="data-label text-xl font-bold">{resume.projectCount}</p><p className="text-xs text-muted">projects</p></div></div>{resume.formats.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{resume.formats.map((format) => <a className="focus-ring rounded-full border border-accent/30 bg-accentSoft px-3 py-1.5 text-xs font-semibold text-accent" href={format.url} key={format.label} rel="noreferrer" target="_blank">{format.label}</a>)}</div>}</Card>) : <Empty title="No generated resume artifacts" detail="Run the evidence middleman and resume generator before an artifact can appear here." />}</section>;
}

function OperationsView({ data }: { data: ProductViewData }) {
  const operations = data.operations;
  if (!operations) return <Empty title="No application goal is configured" />;
  const percent = operations.target > 0 ? Math.min(100, Math.round(operations.completed / operations.target * 100)) : 0;
  return <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
    <Card className="bg-surface"><CardHeader><div><CardTitle>{operations.goalLabel}</CardTitle><CardDescription>Only deterministic confirmation increases this count.</CardDescription></div><Target className="text-accent" size={20} /></CardHeader><p className="data-label text-5xl font-bold">{operations.completed}<span className="text-xl text-muted"> / {operations.target || "—"}</span></p><div className="mt-5 h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} /></div><div className="mt-4 flex items-center justify-between text-sm text-muted"><span>{percent}% confirmed</span><span>{operations.activeWorkers} active workers</span></div><div className="mt-5 rounded-lg border border-border bg-elevated p-3 text-xs leading-5 text-muted"><LockKeyhole className="mr-2 inline text-accent" size={14} />Review, upload, Continue, CAPTCHA, and final Submit remain separately gated.</div></Card>
    <Card className="bg-surface"><CardHeader><div><CardTitle>Human review queue</CardTitle><CardDescription>One approval never authorizes another item.</CardDescription></div><Badge variant="orange">HITL</Badge></CardHeader><div className="space-y-3">{operations.reviews.length ? operations.reviews.map((item) => <article className="rounded-lg border border-border bg-elevated p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p></div><Badge variant={item.state === "blocked" ? "warning" : "default"}>{item.state}</Badge></div>{item.humanGate && <p className="mt-3 flex items-center gap-2 text-xs text-accent"><UserCheck size={13} />Explicit human approval required</p>}{data.meta.mode === "local_demo" && <Button className="mt-4" onClick={() => void runDemoAction("approve_review", item.id)} size="sm" variant="secondary"><UserCheck size={14} />Approve this demo gate</Button>}</article>) : <EmptyInline text="No items are waiting for review." />}</div></Card>
  </section>;
}

function OpportunitiesView({ data }: { data: ProductViewData }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.opportunities?.length ? data.opportunities.map((item) => <Card className="bg-surface" key={item.id}><div className="mb-4 flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accentSoft text-accent"><Target size={20} /></div><Badge>{item.stage.replaceAll("_", " ")}</Badge></div><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-muted">{item.company}</p><div className="mt-5 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-elevated p-3"><p className="text-muted">Location</p><p className="mt-1 font-semibold">{item.location}</p></div><div className="rounded-lg bg-elevated p-3"><p className="text-muted">Work mode</p><p className="mt-1 font-semibold capitalize">{item.workMode}</p></div></div><div className="mt-3 rounded-lg bg-elevated p-3 text-xs"><p className="text-muted">Observed salary</p><p className="mt-1 font-semibold">{item.salaryBand || "Unknown"}</p></div><div className="mt-4 flex items-center justify-between border-t border-border pt-4"><span className="text-xs text-muted">Evidence fit</span><span className="data-label font-bold text-accent">{item.fit === null ? "Unknown" : `${item.fit}%`}</span></div>{data.meta.mode === "local_demo" && item.nextStage && <Button className="mt-4 w-full" onClick={() => void runDemoAction("advance_opportunity", item.id)} size="sm">Move to {item.nextStage.replaceAll("_", " ")}</Button>}</Card>) : <Empty title="No opportunities recorded" detail="The active provider has no stored opportunities." />}</section>;
}

async function runDemoAction(action: "advance_opportunity" | "approve_review" | "toggle_event", id: string) {
  const response = await fetch("/api/product/demo-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Demo action failed.");
  window.location.reload();
}

function ConnectionsView({ data }: { data: ProductViewData }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.connections?.length ? data.connections.map((item) => { const connected = item.status === "connected"; return <Card className="bg-surface" key={item.id}><CardHeader><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${connected ? "bg-success/10 text-success" : "bg-elevated text-muted"}`}>{connected ? <Server size={20} /> : <Unplug size={20} />}</div><Badge variant={connected ? "success" : item.status === "verification_required" ? "warning" : "default"}>{item.status.replaceAll("_", " ")}</Badge></CardHeader><h2 className="font-bold">{item.label}</h2><p className="mt-1 text-xs uppercase tracking-widest text-muted">{item.category.replaceAll("_", " ")}</p><p className="mt-4 text-sm leading-6 text-muted">{item.detail}</p></Card>; }) : <Empty title="No connection summaries" />}</section>;
}

function AdvisorView({ data }: { data: ProductViewData }) {
  return <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><Card className="bg-surface"><CardHeader><div><CardTitle>Evidence-grounded recommendations</CardTitle><CardDescription>Every recommendation identifies its supporting evidence; unsupported advice is omitted.</CardDescription></div><Sparkles className="text-accent" size={20} /></CardHeader><div className="space-y-3">{data.recommendations?.length ? data.recommendations.map((item) => <article className="rounded-lg border border-border bg-elevated p-4" key={item.title}><p className="font-semibold">{item.title}</p><p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p><div className="mt-3 flex flex-wrap gap-2">{item.evidenceIds.map((id) => <Badge key={id}>{id}</Badge>)}</div></article>) : <EmptyInline text="No grounded recommendation is available yet." />}</div></Card><Card className="border-accent/25 bg-accentSoft"><Bot className="text-accent" size={24} /><h2 className="mt-4 font-bold">Advisor boundary</h2><p className="mt-2 text-sm leading-6 text-muted">The advisor can read only bounded normalized evidence. It must abstain when a claim cannot cite an evidence ID.</p></Card></section>;
}

function Empty({ title, detail = "The active provider returned no records for this view." }: { title: string; detail?: string }) {
  return <Card className="col-span-full border-dashed bg-surface py-12 text-center"><Database className="mx-auto text-muted" size={26} /><h2 className="mt-4 font-bold">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted">{detail}</p></Card>;
}

function EmptyInline({ text }: { text: string }) { return <div className="col-span-full rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted">{text}</div>; }

function ViewBody({ view, data, canWriteEvidence }: { view: ProductView; data: ProductViewData; canWriteEvidence: boolean }) {
  if (view === "career-evidence") return <CareerEvidenceView canWrite={canWriteEvidence} data={data} />;
  if (view === "resumes") return <ResumeStudioView data={data} />;
  if (view === "job-operations") return <OperationsView data={data} />;
  if (view === "opportunities") return <OpportunitiesView data={data} />;
  if (view === "connections") return <ConnectionsWorkspaceView data={data} />;
  return <AdvisorView data={data} />;
}

function ProductContent({ view, capabilityKey, safety }: Props) {
  const capability = useCapability(capabilityKey);
  const evidenceWrite = useCapability("evidence_write");
  const [data, setData] = useState<ProductViewData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (capability.state === "locked") return;
    const controller = new AbortController();
    void fetch(`/api/product/${view}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(String(value.error || "Product service failed."));
      setData(value as ProductViewData);
    }).catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(String(reason.message || reason)); });
    return () => controller.abort();
  }, [capability.state, view]);
  return <>
    {data ? <Header capabilityKey={capabilityKey} data={data} /> : <header className="mb-6 flex items-start justify-between gap-4" data-tour="page-heading"><div><p className="data-label mb-2 text-xs uppercase tracking-widest text-accent">Product workspace</p><h1 className="text-3xl font-bold">Loading visual workspace…</h1></div><Badge data-tour="service-status">Checking access</Badge></header>}
    <Card className="mb-4 border-accent/25 bg-accentSoft" data-tour="permission-boundary"><div className="flex gap-3"><ShieldCheck className="mt-0.5 flex-none text-accent" size={20} /><div><strong>Permission boundary</strong><p className="mt-1 text-sm text-muted">{safety}</p></div></div></Card>
    <div data-tour="service-data"><CapabilityGate capabilityKey={capabilityKey}><div data-tour="page-content">{error ? <Card className="bg-surface"><div className="flex gap-3"><AlertTriangle className="flex-none text-accent" /><div><CardTitle>Product data unavailable</CardTitle><p className="mt-2 text-sm text-muted">{error}</p></div></div></Card> : data ? <><Stats data={data} /><ViewBody canWriteEvidence={evidenceWrite.state === "available"} data={data} view={view} />{data.diagnostics !== undefined && <details className="mt-4 rounded-lg border border-border bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-muted">Development diagnostics</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-elevated p-4 font-mono text-xs text-muted">{JSON.stringify(data.diagnostics, null, 2)}</pre></details>}</> : <Card className="bg-surface"><div className="flex items-center gap-3 text-muted"><Server className="animate-pulse" size={20} />Connecting to the active data provider…</div></Card>}</div></CapabilityGate></div>
  </>;
}

export function ProductWorkspace(props: Props) { return <AppShell><ProductContent {...props} /></AppShell>; }
