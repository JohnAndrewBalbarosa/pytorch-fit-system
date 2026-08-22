"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, CheckCircle2, Crown, ExternalLink, FileJson, MailCheck, ScanSearch, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useCapabilities } from "@/components/capability-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/tabs";
import { fetchJson, queryKeys } from "@/lib/client-api";
import type { EvidenceClaim, EventAction, EventPackage, ExternalEvent } from "@/lib/operations-contracts";
import { hasPriorityEnrollment, type UserTier } from "@/lib/permissions";
import type { ProductViewData } from "@/lib/product/contracts";

const roleTabs = [
  { value: "general", label: "General" },
  { value: "active", label: "Active" },
  { value: "leaderboard", label: "Elite" },
  { value: "admin", label: "Officer" },
] satisfies Array<{ value: UserTier; label: string }>;

const statusLabel: Record<ExternalEvent["status"], string> = {
  not_sado_approved: "Not SADO approved",
  department_review: "Department review",
  email_review: "Final email review",
  submitted_to_sado: "Submitted to SADO",
  sado_approved: "SADO approved",
  rejected: "Rejected",
};

const departmentLabel = (value: string) => value.replaceAll("_", " ");

function EventsContent() {
  const manifest = useCapabilities();
  const officer = manifest.portal.audience === "officer";
  const client = useQueryClient();
  const [tier, setTier] = useState<UserTier>("active");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<EventPackage | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [manualDeliveryReferences, setManualDeliveryReferences] = useState<Record<string, string>>({});
  const [sadoReferences, setSadoReferences] = useState<Record<string, string>>({});

  const externalEvents = useQuery({ queryKey: ["external-events"], queryFn: () => fetchJson<ExternalEvent[]>("/api/events", { cache: "no-store" }) });
  const chapterDashboard = useQuery({ queryKey: queryKeys.product("dashboard"), queryFn: () => fetchJson<ProductViewData>("/api/product/dashboard", { cache: "no-store" }) });
  const claims = useQuery({ enabled: officer, queryKey: ["evidence-review"], queryFn: () => fetchJson<EvidenceClaim[]>("/api/officer/evidence", { cache: "no-store" }) });

  const extract = async () => {
    setExtracting(true);
    try {
      const companion = process.env.NEXT_PUBLIC_PYTORCH_FIT_LOCAL_COMPANION_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${companion}/api/org-events/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.detail || "Local extraction failed.");
      setDraft(payload);
      toast.success("Local companion returned a reviewable JSON package.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Start the local companion first.");
    } finally {
      setExtracting(false);
    }
  };

  const submit = useMutation({
    mutationFn: (value: EventPackage) => fetchJson<ExternalEvent>("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }),
    onSuccess: async () => { setDraft(null); setUrl(""); await client.invalidateQueries({ queryKey: ["external-events"] }); toast.success("Event published with an unapproved label."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Submission failed."),
  });

  const action = useMutation({
    mutationFn: ({ id, action: eventAction }: { id: string; action: EventAction }) => fetchJson<ExternalEvent>(`/api/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventAction) }),
    onSuccess: async (_, variables) => {
      if (variables.action.action === "confirm_manual_delivery") setManualDeliveryReferences((current) => ({ ...current, [variables.id]: "" }));
      if (variables.action.action === "record_sado_approval") setSadoReferences((current) => ({ ...current, [variables.id]: "" }));
      await client.invalidateQueries({ queryKey: ["external-events"] });
      toast.success("Event workflow updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed."),
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => fetchJson(`/api/officer/evidence/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["evidence-review"] }); toast.success("Exact claim revision reviewed."); },
  });

  const toggleRegistration = useMutation({
    mutationFn: (id: string) => fetchJson("/api/product/demo-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_event", id }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: queryKeys.product("dashboard") }); toast.success("Synthetic event registration updated."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Event update failed."),
  });

  const approveDelivery = async (event: ExternalEvent) => {
    if (event.emailDraft?.deliveryMode === "copy_export") {
      try {
        await navigator.clipboard.writeText(`${event.emailDraft.subject}\n\n${event.emailDraft.body}`);
      } catch {
        toast.error("Clipboard access failed. Copy the reviewed draft before approving the export.");
        return;
      }
    }
    action.mutate({ id: event.id, action: { action: "approve_email" } });
  };

  const dashboard = chapterDashboard.data || null;
  const effectiveTier = officer ? tier : manifest.portal.userTier;
  const priority = hasPriorityEnrollment(effectiveTier);
  const chapterEvents = dashboard?.events || [];

  return <div className="space-y-8">
    <section className="rounded-2xl border border-accent/30 bg-[radial-gradient(circle_at_top_right,rgba(232,89,12,.27),transparent_35%),#141416] p-6 lg:p-8">
      <Badge variant="orange">External event intelligence</Badge><h1 className="mt-4 text-3xl font-extrabold">Events intake & SADO pipeline</h1>
      <p className="mt-3 max-w-3xl leading-7 text-muted">Your local companion extracts a public link into reviewable JSON. AI proposes fields; departments and SADO remain the approval authorities.</p>
    </section>

    <Card className="bg-surface">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]"><label><span className="mb-2 block text-sm font-semibold">External event URL</span><input className="h-11 w-full rounded-lg border border-border bg-elevated px-3" onChange={(event) => setUrl(event.target.value)} placeholder="https://organizer.example/event" type="url" value={url}/></label><Button className="self-end" disabled={!url || extracting} onClick={extract}><ScanSearch size={17}/>{extracting ? "Extracting locally…" : "Check with local AI"}</Button></div>
      {draft && <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{draft.title}</p><p className="mt-1 text-sm text-muted">{draft.organizer} · confidence {Math.round(draft.confidence * 100)}%</p></div><Badge variant="success"><FileJson size={14}/>JSON valid</Badge></div><p className="mt-3 text-sm leading-6">{draft.summary}</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => submit.mutate(draft)} size="sm">Publish as unapproved event</Button><Button onClick={() => navigator.clipboard.writeText(JSON.stringify(draft, null, 2))} size="sm" variant="secondary">Copy JSON</Button><Button onClick={() => setDraft(null)} size="sm" variant="ghost">Discard</Button></div></div>}
    </Card>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {externalEvents.data?.map((event) => <Card className="flex flex-col bg-surface" key={event.id}>
        <div className="flex items-start justify-between gap-3"><CalendarDays className="text-accent"/><Badge variant={event.status === "sado_approved" ? "success" : "warning"}>{statusLabel[event.status]}</Badge></div>
        <h2 className="mt-4 text-lg font-bold">{event.title}</h2><p className="mt-1 text-sm text-muted">{event.organizer}</p><p className="mt-3 line-clamp-3 text-sm leading-6">{event.summary}</p>
        <div className="mt-4 rounded-lg border border-border bg-elevated p-3 text-xs leading-5"><p>{new Date(event.startAt).toLocaleString()} · {event.timezone}</p><p>{event.venue}</p><p className="mt-2 flex items-center gap-2"><Users size={14}/>{event.interestCount} interested</p></div>
        <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Required approvals</p><div className="mt-2 flex flex-wrap gap-1">{event.requiredDepartments.map((department) => <Badge key={department} variant={event.approvedDepartments.includes(department) ? "success" : "default"}>{departmentLabel(department)}</Badge>)}</div></div>
        <a className="mt-3 flex items-center gap-2 text-sm text-accent" href={event.sourceUrl} rel="noreferrer" target="_blank">Open source <ExternalLink size={14}/></a>
        <div className="mt-auto space-y-2 pt-4">
          {!officer && event.status !== "sado_approved" && <Button className="w-full" disabled={event.interested} onClick={() => action.mutate({ id: event.id, action: { action: "interest" } })} size="sm" variant="secondary">{event.interested ? "Interest recorded" : "I’m interested"}</Button>}
          {officer && event.departmentApprovals < event.departmentTotal && <Button className="w-full" onClick={() => action.mutate({ id: event.id, action: { action: "approve_department" } })} size="sm">{manifest.localDemo ? "Simulate next required department" : "Approve my department"} ({event.departmentApprovals}/{event.departmentTotal})</Button>}
          {officer && event.status === "email_review" && <>
            <div className="rounded-lg border border-border p-3 text-xs"><div className="mb-2 flex items-center justify-between gap-2"><p className="font-bold">{event.emailDraft?.subject}</p><Badge>{event.emailDraft?.deliveryMode.replaceAll("_", " ")}</Badge></div><pre className="max-h-36 overflow-auto whitespace-pre-wrap text-muted">{event.emailDraft?.body}</pre></div>
            {event.emailDraft?.deliveryStatus !== "exported" && <div className="grid grid-cols-2 gap-2"><Button onClick={() => navigator.clipboard.writeText(`${event.emailDraft?.subject || ""}\n\n${event.emailDraft?.body || ""}`)} size="sm" variant="secondary">Copy draft</Button><Button disabled={action.isPending} onClick={() => approveDelivery(event)} size="sm"><MailCheck size={14}/>{event.emailDraft?.deliveryMode === "gmail" ? "Approve & send" : "Approve exact export"}</Button></div>}
            {event.emailDraft?.deliveryStatus === "exported" && <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3"><p className="text-xs text-muted">The exact draft was exported. Record the real sent-message or thread reference only after manual delivery.</p><input className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm" onChange={(change) => setManualDeliveryReferences((current) => ({ ...current, [event.id]: change.target.value }))} placeholder="Sent email/thread reference" value={manualDeliveryReferences[event.id] || ""}/><Button className="w-full" disabled={(manualDeliveryReferences[event.id] || "").trim().length < 4} onClick={() => action.mutate({ id: event.id, action: { action: "confirm_manual_delivery", detail: manualDeliveryReferences[event.id] } })} size="sm">Confirm manual delivery</Button></div>}
          </>}
          {officer && event.status === "submitted_to_sado" && <div className="space-y-2"><label className="block text-xs font-semibold">SADO response reference<input className="mt-1 h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm" onChange={(change) => setSadoReferences((current) => ({ ...current, [event.id]: change.target.value }))} placeholder="Email/thread/reference ID" value={sadoReferences[event.id] || ""}/></label><Button className="w-full" disabled={(sadoReferences[event.id] || "").trim().length < 4} onClick={() => action.mutate({ id: event.id, action: { action: "record_sado_approval", detail: sadoReferences[event.id] } })} size="sm"><CheckCircle2 size={14}/>Record SADO proof</Button></div>}
        </div>
      </Card>)}
    </section>

    <section className="space-y-4" data-tour="events-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold tracking-[-0.02em]">Chapter events & registration</h2><p className="mt-2 text-muted">Upcoming workshops, clinics, hackathons, and chapter activities remain available alongside external-event review.</p></div><div data-tour="events-role">{officer ? <SegmentedTabs items={roleTabs} onChange={setTier} value={tier}/> : <Badge variant="orange">{effectiveTier === "general" ? "Member access" : "Priority member"}</Badge>}</div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="events-grid">
        {chapterEvents.map((event) => <Card className="flex flex-col bg-surface" key={event.id}>
          <div className="mb-4 flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accentSoft text-accent"><CalendarDays size={20}/></div>{priority ? <Badge variant="orange"><Crown size={14}/>Priority seat</Badge> : effectiveTier === "active" ? <Badge variant="success"><Bell size={14}/>Early access</Badge> : <Badge>Standard queue</Badge>}</div>
          <h3 className="text-lg font-bold tracking-[-0.02em]">{event.title}</h3><p className="mt-3 text-sm leading-6 text-muted">{event.department}</p>
          <div className="mt-4 space-y-3 rounded-lg border border-border bg-elevated p-3 text-xs leading-5"><p><strong>Learning objective:</strong> {event.learningObjective}</p><p><strong>Expected output:</strong> {event.output}</p></div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4"><div><p className="data-label text-sm">{event.date}</p><p className="text-xs text-muted">{event.type}</p></div><div className="flex items-center gap-2 text-sm text-muted"><Users size={16}/>{event.seats}</div></div>
          {dashboard?.meta.mode === "local_demo" && <Button className="mt-4 w-full" disabled={toggleRegistration.isPending} onClick={() => toggleRegistration.mutate(event.id)} size="sm" variant={event.registered ? "secondary" : "primary"}>{event.registered ? "Leave synthetic event" : "Join synthetic event"}</Button>}
        </Card>)}
      </div>
    </section>

    {officer && <Card className="bg-surface"><div className="flex items-center gap-3"><ShieldAlert className="text-warning"/><div><h2 className="font-bold">Manual evidence review</h2><p className="text-sm text-muted">AI never approves these changes. Only the responsible department may approve the exact revision.</p></div></div><div className="mt-4 space-y-2">{claims.data?.map((claim) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3" key={claim.id}><div><p className="font-semibold">{claim.title}</p><p className="mt-1 text-xs text-muted">{claim.memberLabel} · {claim.source} · {departmentLabel(claim.department)} · {claim.contentHash}</p></div><div className="flex gap-2"><Badge variant={claim.provenance === "scraped_verified" || claim.provenance === "officer_reviewed" ? "success" : "warning"}>{claim.provenance.replaceAll("_", " ")}</Badge>{claim.provenance === "manual_pending" && <><Button onClick={() => review.mutate({ id: claim.id, decision: "reject" })} size="sm" variant="secondary">Reject</Button><Button onClick={() => review.mutate({ id: claim.id, decision: "approve" })} size="sm">Approve exact claim</Button></>}</div></div>)}</div></Card>}
  </div>;
}

export default function EventsPage() {
  return <AppShell><EventsContent/></AppShell>;
}
