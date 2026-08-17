"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleDot,
  Cloud, Database, Download, ExternalLink, FileCheck2, FileText, GitBranch,
  Globe2, ImageIcon, Link2, LockKeyhole, Network, Pencil, Plug, RefreshCw,
  Plus, Server, ShieldCheck, Sparkles, Unplug, Upload, UserCheck, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { Connection, EvidenceItem, EvidenceSource, ProductViewData, ResumeProfile } from "@/lib/product/contracts";
import { downloadDocx, downloadHtml, downloadPdf, resumeHtml, resumePdfPageCount, resumeTemplates, type ResumeTemplateId } from "@/lib/product/resume-exports";

function Dialog({ title, description, children, onClose, wide = false }: { title: string; description: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog">
    <button aria-label="Close dialog" className="absolute inset-0 cursor-default" onClick={onClose} />
    <div className={`relative max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
        <div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div>
        <Button aria-label="Close" onClick={onClose} size="icon" variant="ghost"><X size={18} /></Button>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

const sourceTone = (source: EvidenceSource) => source.connectionStatus === "connected" ? "success" : source.connectionStatus === "verification_required" ? "warning" : "default";
const verificationTone = (state: EvidenceItem["verificationState"]) => state === "user_verified" ? "success" : state === "ai_proposed" ? "orange" : "default";

function SourceDialog({ source, canWrite, onChanged, onClose }: { source: EvidenceSource; canWrite: boolean; onChanged: (source: EvidenceSource) => void; onClose: () => void }) {
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState(source.configuredUrl || "");
  const [busy, setBusy] = useState(false);
  const connected = source.connectionStatus === "connected";
  const method = source.connectionMethod === "website_session" ? "Visible browser session" : source.connectionMethod === "url" ? "Submitted URL" : source.connectionMethod === "upload" ? "Private upload" : "Manual entry";
  const run = async (action: "connect" | "sync" | "disconnect") => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/product/sources/${source.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, confirmation: action === "disconnect", url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Source action failed.");
      onChanged(payload.source as EvidenceSource);
      setNotice(action === "sync" ? "Source collection completed and was recorded." : action === "disconnect" ? "Source disconnected." : "Source connection saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Source action failed."); }
    finally { setBusy(false); }
  };
  return <Dialog description="Connection controls never expose credentials, cookies, or raw browser state." onClose={onClose} title={source.label}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-elevated p-4"><p className="text-xs uppercase tracking-widest text-muted">Access</p><p className="mt-2 font-semibold">{method}</p></div>
      <div className="rounded-xl border border-border bg-elevated p-4"><p className="text-xs uppercase tracking-widest text-muted">Evidence collected</p><p className="data-label mt-2 text-2xl font-bold">{source.evidenceCount || 0}</p></div>
    </div>
    <p className="mt-5 text-sm leading-6 text-muted">{source.description}</p>
    <div className="mt-5"><p className="text-sm font-semibold">Exact permissions</p><ul className="mt-3 space-y-2">{source.permissions?.map((permission) => <li className="flex items-center gap-2 text-sm text-muted" key={permission}><Check size={14} className="text-success" />{permission}</li>)}</ul></div>
    {source.lastSyncedAt && <p className="mt-5 text-xs text-muted">Last synchronized: {new Date(source.lastSyncedAt).toLocaleString()}</p>}
    {source.connectionStatus === "verification_required" && <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6"><AlertTriangle className="mr-2 inline text-warning" size={16} />Open a normal visible browser and complete verification yourself. Collection remains paused until then.</div>}
    {!connected && source.connectionMethod === "url" && <div className="mt-5"><Label htmlFor="source-url">Portfolio URL</Label><Input id="source-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/portfolio" type="url" value={url} /></div>}
    {notice && <div aria-live="polite" className="mt-5 rounded-xl border border-accent/25 bg-accentSoft p-4 text-sm">{notice}</div>}
    <div className="mt-6 flex flex-wrap gap-2">
      {connected ? <><Button disabled={!canWrite || busy} onClick={() => run("sync")}><RefreshCw size={16} />Sync selected evidence</Button><Button disabled={!canWrite || busy} onClick={() => run("disconnect")} variant="secondary">Disconnect</Button></> : <Button disabled={!canWrite || busy} onClick={() => run("connect")}><Plug size={16} />{source.connectionStatus === "verification_required" ? "Resume verification" : "Connect source"}</Button>}
    </div>
  </Dialog>;
}

function EvidenceDialog({ item, canWrite, onClose, onSave }: { item: EvidenceItem; canWrite: boolean; onClose: () => void; onSave: (item: EvidenceItem) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  const [proposalVisible, setProposalVisible] = useState(item.verificationState === "ai_proposed");
  const [consented, setConsented] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const change = (field: keyof EvidenceItem, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  return <Dialog description="Edit the source-of-truth achievement here. Resume Studio only reads approved facts." onClose={onClose} title={draft.title} wide>
    <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
      <div>
        <Image alt={draft.mediaAlt} className="aspect-[4/3] w-full rounded-xl object-cover" height={900} src={draft.mediaUrl} unoptimized={draft.mediaUrl.startsWith("/api/")} width={1200} />
        <div className="mt-3 flex flex-wrap gap-2"><Badge variant={verificationTone(draft.verificationState)}>{draft.verificationState.replaceAll("_", " ")}</Badge>{draft.confidence && <Badge>{draft.confidence}% source match</Badge>}</div>
        <div className="mt-5 rounded-xl border border-accent/25 bg-accentSoft p-4">
          <p className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-accent" />AI evidence assistant</p>
          <p className="mt-2 text-xs leading-5 text-muted">EXIF is stripped. Only this selected photo and bounded source text are sent to the configured provider. AI can propose; only you can approve.</p>
          <label className="mt-4 flex items-start gap-2 text-xs"><input checked={consented} className="mt-0.5" onChange={(event) => setConsented(event.target.checked)} type="checkbox" />I approve analysis of this selected demo evidence.</label>
          <Button className="mt-4 w-full" disabled={!canWrite || !consented || analyzing} onClick={async () => {
            setAnalyzing(true); setAnalysisError("");
            try {
              const response = await fetch("/api/product/evidence/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, evidenceId: draft.id, current: { title: draft.title, description: draft.description, skills: draft.skills } }) });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error || "AI analysis failed.");
              setDraft((current) => ({ ...current, aiProposal: payload.proposal, verificationState: "ai_proposed" }));
              setProposalVisible(true);
            } catch (error) { setAnalysisError(error instanceof Error ? error.message : "AI analysis failed."); }
            finally { setAnalyzing(false); }
          }} size="sm"><Bot size={15} />{analyzing ? "Analyzing…" : "Analyze selected evidence"}</Button>
          {analysisError && <p className="mt-3 text-xs leading-5 text-danger">{analysisError}</p>}
        </div>
      </div>
      <div className="space-y-4">
        <div><Label htmlFor="evidence-title">Achievement title</Label><Input id="evidence-title" onChange={(event) => change("title", event.target.value)} value={draft.title} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="evidence-org">Organization</Label><Input id="evidence-org" onChange={(event) => change("organization", event.target.value)} value={draft.organization} /></div><div><Label htmlFor="evidence-role">Role</Label><Input id="evidence-role" onChange={(event) => change("role", event.target.value)} value={draft.role} /></div></div>
        <div><Label htmlFor="evidence-date">Date</Label><Input id="evidence-date" onChange={(event) => change("dateLabel", event.target.value)} value={draft.dateLabel} /></div>
        <div><Label htmlFor="evidence-description">Description</Label><textarea className="focus-ring mt-1 min-h-28 w-full rounded-lg border border-border bg-elevated p-3 text-sm" id="evidence-description" onChange={(event) => change("description", event.target.value)} value={draft.description} /></div>
        <div><Label htmlFor="evidence-skills">Skills</Label><Input id="evidence-skills" onChange={(event) => setDraft((current) => ({ ...current, skills: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} value={draft.skills.join(", ")} /></div>
        {proposalVisible && draft.aiProposal && <div className="rounded-xl border border-accent/30 bg-accentSoft p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">AI proposal</p><p className="mt-1 text-xs leading-5 text-muted">{draft.aiProposal.summary}</p></div><Badge variant="orange">Review</Badge></div><div className="mt-4 space-y-3">{draft.aiProposal.changes.map((proposal) => <div className="rounded-lg border border-border bg-surface p-3" key={proposal.field}><p className="text-xs font-semibold">{proposal.field}</p><p className="mt-2 text-xs text-danger line-through">{proposal.before}</p><p className="mt-1 text-xs text-success">{proposal.after}</p></div>)}</div>{draft.aiProposal.warnings.map((warning) => <p className="mt-3 flex gap-2 text-xs text-warning" key={warning}><AlertTriangle size={13} />{warning}</p>)}<Button className="mt-4" onClick={() => { const description = draft.aiProposal?.changes.find((changeItem) => changeItem.field === "Description")?.after; const skills = draft.aiProposal?.changes.find((changeItem) => changeItem.field === "Skills")?.after; setDraft((current) => ({ ...current, description: description || current.description, skills: skills ? skills.split(",").map((value) => value.trim()) : current.skills, verificationState: "source_matched" })); setProposalVisible(false); }} size="sm"><Check size={15} />Apply selected changes</Button></div>}
        {saveError && <p aria-live="polite" className="text-sm text-danger">{saveError}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button onClick={onClose} variant="ghost">Cancel</Button><Button disabled={!canWrite || saving} onClick={async () => { setSaving(true); setSaveError(""); try { await onSave({ ...draft, verificationState: "user_verified" }); onClose(); } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save evidence."); } finally { setSaving(false); } }}><UserCheck size={16} />{saving ? "Saving…" : "Save & approve"}</Button></div>
      </div>
    </div>
  </Dialog>;
}

export function CareerEvidenceView({ data, canWrite }: { data: ProductViewData; canWrite: boolean }) {
  const evidence = data.evidence;
  const [source, setSource] = useState<EvidenceSource | null>(null);
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [items, setItems] = useState(evidence?.items || []);
  const [sources, setSources] = useState(evidence?.sources || []);
  const [actionError, setActionError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  if (!evidence) return <Card>No evidence view is available.</Card>;
  const steps = [{ label: "Approved sources", icon: FileText }, { label: "Retrieval middleman", icon: GitBranch }, { label: "Normalize + verify", icon: Network }, { label: "Career database", icon: Database }];
  const persist = async (item: EvidenceItem) => {
    const creating = item.id.startsWith("new-");
    const response = await fetch(creating ? "/api/product/evidence" : `/api/product/evidence/${item.id}`, { method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item, approve: true }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save evidence.");
    const saved = payload.item as EvidenceItem;
    setItems((current) => creating ? [saved, ...current] : current.map((entry) => entry.id === saved.id ? saved : entry));
  };
  const startManual = () => setSelected({
    id: `new-${crypto.randomUUID()}`,
    sourceId: "manual",
    title: "New career achievement",
    organization: "",
    role: "",
    dateLabel: "",
    description: "",
    quantitative: [],
    qualitative: [],
    skills: [],
    mediaUrl: "/demo/evidence/manual-placeholder.svg",
    mediaAlt: "Placeholder for manually entered career evidence",
    verificationState: "draft",
  });
  const upload = async (file: File) => {
    setUploading(true); setActionError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("title", file.name.replace(/\.[^.]+$/, ""));
      const response = await fetch("/api/product/evidence", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not upload evidence.");
      const item = payload.item as EvidenceItem;
      setItems((current) => [item, ...current]); setSelected(item);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not upload evidence."); }
    finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ""; }
  };
  return <div className="space-y-4">
    <Card className="overflow-hidden border-accent/25 bg-accentSoft"><CardHeader><div><CardTitle>One controlled evidence pipeline</CardTitle><CardDescription>Metadata-aware inventory becomes reusable rules; generated resumes never become source evidence.</CardDescription></div><ShieldCheck className="text-accent" size={20} /></CardHeader><div className="grid gap-2 md:grid-cols-4">{steps.map(({ label, icon: Icon }, index) => <div className="rounded-lg border border-border bg-surface p-4" key={label}><div className="mb-3 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft text-accent"><Icon size={18} /></span>{index < 3 && <ArrowRight className="hidden text-muted md:block" size={16} />}</div><p className="text-sm font-semibold">{label}</p></div>)}</div></Card>
    <Card className="bg-surface"><CardHeader><div><CardTitle>Supported sources & connections</CardTitle><CardDescription>Click a source to inspect permissions, connect it, or sync selected evidence.</CardDescription></div><Badge variant="orange">Rules are reusable</Badge></CardHeader><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{sources.map((item) => <button className="focus-ring group rounded-xl border border-border bg-elevated p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/40" key={item.id} onClick={() => setSource(item)}><div className="flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-accent">{item.connectionMethod === "website_session" ? <Globe2 size={18} /> : item.connectionMethod === "upload" ? <ImageIcon size={18} /> : <Link2 size={18} />}</span><Badge variant={sourceTone(item)}>{item.maturity === "available" ? item.connectionStatus?.replaceAll("_", " ") : item.maturity}</Badge></div><p className="mt-4 font-semibold">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted">{item.kind}</p><div className="mt-4 flex items-center justify-between text-xs text-muted"><span>{item.evidenceCount || 0} items</span><ChevronRight className="transition group-hover:translate-x-1" size={15} /></div></button>)}</div></Card>
    <Card className="bg-surface"><CardHeader><div><CardTitle>Achievement gallery</CardTitle><CardDescription>Open a photo to edit the user-owned fact or review an AI proposal.</CardDescription></div><div className="flex flex-wrap justify-end gap-2"><Badge variant="success">{items.filter((item) => item.verificationState === "user_verified").length} verified</Badge><Button disabled={!canWrite} onClick={startManual} size="sm" variant="secondary"><Plus size={14} />Manual entry</Button><Button disabled={!canWrite || uploading} onClick={() => uploadRef.current?.click()} size="sm"><Upload size={14} />{uploading ? "Preparing…" : "Upload photo"}</Button><input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} ref={uploadRef} type="file" /></div></CardHeader>{actionError && <p aria-live="polite" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{actionError}</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button className="focus-ring group overflow-hidden rounded-xl border border-border bg-elevated text-left" key={item.id} onClick={() => setSelected(item)}><div className="relative aspect-[4/3] overflow-hidden"><Image alt={item.mediaAlt} className="object-cover transition duration-500 group-hover:scale-[1.03]" fill sizes="(max-width:768px) 100vw, 33vw" src={item.mediaUrl} unoptimized={item.mediaUrl.startsWith("/api/")} /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-4 pt-12"><Badge variant={verificationTone(item.verificationState)}>{item.verificationState.replaceAll("_", " ")}</Badge></div></div><div className="p-4"><p className="font-semibold leading-6">{item.title}</p><p className="mt-2 text-xs text-muted">{item.organization} · {item.dateLabel}</p><div className="mt-4 flex items-center justify-between text-xs text-accent"><span className="flex items-center gap-1"><Pencil size={13} />Open achievement</span><ChevronRight size={15} /></div></div></button>)}</div></Card>
    {evidence.blockers.length > 0 && <Card className="border-warning/30 bg-warning/10"><CardHeader><div><CardTitle>Evidence blockers</CardTitle><CardDescription>These require a real source or human action.</CardDescription></div><AlertTriangle className="text-warning" size={20} /></CardHeader><ul className="space-y-2 text-sm">{evidence.blockers.map((item) => <li className="flex gap-2" key={item}><CircleDot className="mt-1 flex-none text-warning" size={13} />{item}</li>)}</ul></Card>}
    {source && <SourceDialog canWrite={canWrite} onChanged={(updated) => { setSources((current) => current.map((item) => item.id === updated.id ? updated : item)); setSource(updated); }} onClose={() => setSource(null)} source={source} />}
    {selected && <EvidenceDialog canWrite={canWrite} item={selected} onClose={() => setSelected(null)} onSave={persist} />}
  </div>;
}

function ResumePreview({ profile, templateId }: { profile: ResumeProfile; templateId: ResumeTemplateId }) {
  return <iframe className="h-[720px] w-full rounded-xl border border-border bg-white" srcDoc={resumeHtml(profile, templateId)} title={`${templateId} resume preview`} />;
}

export function ResumeStudioView({ data }: { data: ProductViewData }) {
  const [templateId, setTemplateId] = useState<ResumeTemplateId | null>(null);
  const [busy, setBusy] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const profile = data.resumeProfile;
  const template = resumeTemplates.find((item) => item.id === templateId);
  useEffect(() => {
    let active = true;
    setPageCount(null);
    if (profile && templateId) void resumePdfPageCount(profile, templateId).then((count) => { if (active) setPageCount(count); }).catch(() => { if (active) setPageCount(0); });
    return () => { active = false; };
  }, [profile, templateId]);
  if (!profile) return <Card className="border-dashed bg-surface py-12 text-center"><FileText className="mx-auto text-muted" /><h2 className="mt-4 font-bold">No verified resume snapshot</h2><p className="mt-2 text-sm text-muted">Approve evidence in Career Evidence before selecting a template.</p></Card>;
  const run = async (label: string, action: () => void | Promise<void>) => { setBusy(label); try { await action(); } finally { setBusy(""); } };
  return <>
    <Card className="mb-4 border-accent/25 bg-accentSoft"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><LockKeyhole className="mt-1 flex-none text-accent" size={20} /><div><p className="font-semibold">Read-only normalized snapshot</p><p className="mt-1 text-sm leading-6 text-muted">Templates inject approved Career Evidence. They cannot edit the underlying details.</p></div></div><Link className="focus-ring inline-flex items-center gap-2 rounded-full border border-accent/30 px-4 py-2 text-sm font-semibold text-accent" href="/career/evidence">Edit in Career Evidence <ArrowRight size={15} /></Link></div></Card>
    <section className="grid gap-4 md:grid-cols-3">{resumeTemplates.map((item, index) => <button className="focus-ring group text-left" key={item.id} onClick={() => setTemplateId(item.id)}><Card className="h-full bg-surface group-hover:border-accent/40"><div className="aspect-[3/4] rounded-xl border border-border bg-white p-5 text-slate-800 shadow-sm"><div className="h-4 w-2/3 rounded" style={{ backgroundColor: item.accent }} /><div className="mt-2 h-1.5 w-1/2 rounded bg-slate-300" /><div className="mt-6 space-y-4">{Array.from({ length: index === 2 ? 6 : 5 }).map((_, lineIndex) => <div key={lineIndex}><div className="h-1.5 w-1/3 rounded" style={{ backgroundColor: item.accent }} /><div className="mt-2 h-1 w-full rounded bg-slate-200" /><div className="mt-1 h-1 w-5/6 rounded bg-slate-200" /></div>)}</div></div><div className="mt-4 flex items-start justify-between gap-3"><div><p className="font-bold">{item.name}</p><p className="mt-1 text-sm leading-6 text-muted">{item.description}</p></div><Badge variant="success">ATS ready</Badge></div><p className="mt-4 flex items-center justify-between text-xs text-accent"><span>{item.density} density</span><span className="flex items-center gap-1">Preview <ChevronRight size={14} /></span></p></Card></button>)}</section>
    {templateId && template && <Dialog description={`${template.description} Content is injected from verified Career Evidence.`} onClose={() => setTemplateId(null)} title={`${template.name} resume`} wide><div className="grid gap-5 xl:grid-cols-[1fr_260px]"><ResumePreview profile={profile} templateId={templateId} /><aside className="space-y-4"><div className="rounded-xl border border-border bg-elevated p-4"><p className="text-xs uppercase tracking-widest text-muted">Measured PDF fit</p><p className={`mt-3 flex items-center gap-2 font-semibold ${pageCount === 1 ? "text-success" : pageCount && pageCount > 1 ? "text-warning" : "text-muted"}`}><CheckCircle2 size={17} />{pageCount === null ? "Measuring generated PDF…" : pageCount === 0 ? "Measurement unavailable" : `${pageCount}-page PDF generated`}</p><p className="mt-2 text-xs leading-5 text-muted">Page count comes from the same PDF generator used by Export. Single-column semantic HTML remains available separately.</p></div><div className="rounded-xl border border-border p-4"><p className="font-semibold">Export this result</p><div className="mt-4 grid gap-2"><Button disabled={Boolean(busy)} onClick={() => run("HTML", () => downloadHtml(profile, templateId))} variant="secondary"><Download size={15} />HTML</Button><Button disabled={Boolean(busy)} onClick={() => run("DOCX", () => downloadDocx(profile, templateId))} variant="secondary"><Download size={15} />Editable DOCX</Button><Button disabled={Boolean(busy) || pageCount === null} onClick={() => run("PDF", () => downloadPdf(profile, templateId))}><Download size={15} />{busy || "PDF"}</Button></div></div><Link className="focus-ring flex items-center justify-between rounded-xl border border-accent/30 bg-accentSoft p-4 text-sm font-semibold text-accent" href="/career/evidence">Edit source evidence <ExternalLink size={15} /></Link></aside></div></Dialog>}
  </>;
}

export function ConnectionsWorkspaceView({ data }: { data: ProductViewData }) {
  const [selected, setSelected] = useState<Connection | null>(null);
  const [notice, setNotice] = useState("");
  const connections = useMemo(() => data.connections || [], [data.connections]);
  return <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{connections.length ? connections.map((item) => { const connected = item.status === "connected"; return <button className="focus-ring group text-left" key={item.id} onClick={() => { setSelected(item); setNotice(""); }}><Card className="h-full bg-surface group-hover:border-accent/40"><CardHeader><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${connected ? "bg-success/10 text-success" : "bg-elevated text-muted"}`}>{connected ? <Server size={20} /> : <Unplug size={20} />}</div><Badge variant={connected ? "success" : item.status === "verification_required" ? "warning" : "default"}>{item.status.replaceAll("_", " ")}</Badge></CardHeader><h2 className="font-bold">{item.label}</h2><p className="mt-1 text-xs uppercase tracking-widest text-muted">{item.category.replaceAll("_", " ")}</p><p className="mt-4 text-sm leading-6 text-muted">{item.detail}</p><p className="mt-5 flex items-center justify-between text-xs font-semibold text-accent"><span>{connected ? "Manage connection" : "Connection options"}</span><ChevronRight className="transition group-hover:translate-x-1" size={15} /></p></Card></button>; }) : <Card>No connection summaries.</Card>}</section>
    {selected && <Dialog description="Connection state is sanitized; secrets and browser storage never appear here." onClose={() => setSelected(null)} title={selected.label}><div className="rounded-xl border border-border bg-elevated p-5"><div className="flex items-center justify-between gap-3"><p className="font-semibold">Current state</p><Badge variant={selected.status === "connected" ? "success" : selected.status === "verification_required" ? "warning" : "default"}>{selected.status.replaceAll("_", " ")}</Badge></div><p className="mt-3 text-sm leading-6 text-muted">{selected.detail}</p></div>{selected.status === "verification_required" && <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm"><AlertTriangle className="mr-2 inline text-warning" size={16} />A normal visible browser must be used. CAPTCHA and identity checks cannot be bypassed.</p>}{notice && <p className="mt-4 rounded-xl border border-accent/25 bg-accentSoft p-4 text-sm">{notice}</p>}<div className="mt-5 flex flex-wrap gap-2">{selected.status === "connected" ? <><Button onClick={() => setNotice("Connection check queued in preview; live checks run through the server gateway.")}><RefreshCw size={15} />Check connection</Button><Button onClick={() => setNotice("The live gateway requires confirmation before disconnecting.")} variant="secondary">Disconnect</Button></> : <Button onClick={() => setNotice("Guided connection is ready. External verification remains a human step.")}><Plug size={15} />{selected.status === "verification_required" ? "Continue verification" : "Connect"}</Button>}</div></Dialog>}
  </>;
}
