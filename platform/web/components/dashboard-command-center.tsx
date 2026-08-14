"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Database,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unplug,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useCapabilities } from "@/components/capability-context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CapabilityKey } from "@/lib/capabilities";
import type { ProductViewData } from "@/lib/product/contracts";
import { cn } from "@/lib/utils";

type Destination = {
  href: string;
  title: string;
  description: string;
  value: (data: ProductViewData) => string;
  detail: (data: ProductViewData) => string;
  icon: typeof UserRound;
  capability: CapabilityKey;
};

const destinations: Destination[] = [
  { href: "/career/evidence", title: "Evidence readiness", description: "Trace sources through the middleman.", value: (data) => data.evidence?.ready ? "READY" : "SETUP", detail: (data) => `${data.evidence?.sources.length || 0} approved sources`, icon: UserRound, capability: "evidence_read" },
  { href: "/career/resumes", title: "Resume artifacts", description: "Review role-specific generated outputs.", value: (data) => String(data.resumes?.filter((item) => item.ready).length || 0), detail: () => "Human-reviewed artifacts", icon: FileCheck2, capability: "resume_read" },
  { href: "/jobs/analytics", title: "Market snapshot", description: "Compare demand with verified evidence.", value: () => "READ", detail: () => "Analytics is read-only", icon: BarChart3, capability: "analytics_read" },
  { href: "/jobs/automation", title: "Application goal", description: "Monitor safe work and review gates.", value: (data) => `${data.operations?.completed || 0}/${data.operations?.target || 0}`, detail: (data) => `${data.operations?.reviews.length || 0} human reviews`, icon: Bot, capability: "application_draft" },
  { href: "/jobs/opportunities", title: "Target opportunities", description: "Inspect roles and funnel progress.", value: (data) => String(data.opportunities?.length || 0), detail: () => "Evidence-backed matches", icon: BriefcaseBusiness, capability: "job_discovery" },
  { href: "/connections", title: "Provider health", description: "Check approved sessions and services.", value: (data) => String(data.connections?.filter((item) => item.status === "connected").length || 0), detail: () => "Connected providers", icon: Unplug, capability: "connections" },
];

function DestinationCard({ item, data }: { item: Destination; data: ProductViewData }) {
  const manifest = useCapabilities();
  const capability = manifest.capabilities[item.capability];
  const locked = capability.state === "locked";
  const Icon = item.icon;
  const body = <>
    <div className="flex items-start justify-between gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", locked ? "bg-white/[0.04] text-[#FFF7ED]/25" : "bg-[#e8590c]/10 text-[#e8590c]")}><Icon size={20} /></div>{locked ? <LockKeyhole className="text-[#FFF7ED]/25" size={17} /> : <ArrowUpRight className="text-[#FFF7ED]/35" size={17} />}</div>
    <p className="mt-5 text-sm text-[#FFF7ED]/48">{item.title}</p>
    <p className="data-label mt-2 text-3xl font-bold text-[#FFF7ED]">{locked ? "LOCKED" : item.value(data)}</p>
    <p className="mt-3 text-sm leading-6 text-[#FFF7ED]/45">{locked ? capability.reason : item.description}</p>
    <p className="mt-4 border-t border-white/10 pt-3 text-xs text-[#FFF7ED]/35">{locked ? `Required: ${capability.missing.join(", ")}` : item.detail(data)}</p>
  </>;
  if (locked) return <Card aria-disabled="true" className="border-white/10 bg-[#141416] opacity-55" data-capability={item.capability}>{body}</Card>;
  return <Link className="focus-ring group rounded-lg" href={item.href}><Card className="h-full border-white/10 bg-[#141416] group-hover:border-[#e8590c]/40 group-hover:bg-[#171719]">{body}</Card></Link>;
}

function DashboardContent() {
  const [data, setData] = useState<ProductViewData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/product/dashboard", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(String(value.error || "Dashboard unavailable."));
      setData(value as ProductViewData);
    }).catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(String(reason.message || reason)); });
    return () => controller.abort();
  }, []);

  if (error) return <Card className="border-[#e8590c]/30 bg-[#141416]"><div className="flex gap-3"><AlertTriangle className="flex-none text-[#e8590c]" /><div><h1 className="font-bold">Command Center unavailable</h1><p className="mt-2 text-sm text-[#FFF7ED]/50">{error}</p></div></div></Card>;
  if (!data) return <Card className="border-white/10 bg-[#141416]"><p className="flex items-center gap-3 text-[#FFF7ED]/50"><Database className="animate-pulse" size={20} />Connecting to the active data provider…</p></Card>;

  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#141416] p-5 lg:p-7" data-tour="dashboard-overview">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(232,89,12,0.22),transparent_34%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-4 flex flex-wrap gap-2"><Badge variant="orange"><Sparkles size={14} /> Career command</Badge><Badge variant={data.meta.source === "live" ? "success" : "orange"}><Database size={13} />{data.meta.label}</Badge><Badge><ShieldCheck size={13} /> Permission gated</Badge></div><h1 className="max-w-3xl text-3xl font-extrabold tracking-[-0.03em] text-[#FFF7ED] md:text-4xl">{data.heading.title}</h1><p className="mt-3 max-w-2xl leading-7 text-[#FFF7ED]/58">{data.heading.description}</p></div><div className="grid min-w-[285px] grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-3"><p className="text-xs text-[#FFF7ED]/45">Evidence state</p><p className={cn("data-label mt-2 text-xl font-bold", data.evidence?.ready ? "text-green-400" : "text-[#facc15]")}>{data.evidence?.ready ? "READY" : "SETUP"}</p></div><div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-3"><p className="text-xs text-[#FFF7ED]/45">Data provider</p><p className="data-label mt-2 text-xl font-bold uppercase text-[#e8590c]">{data.meta.provider}</p></div></div></div>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-tour="dashboard-metrics">{destinations.map((item) => <DestinationCard data={data} item={item} key={item.href} />)}</section>

    <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <Card className="border-white/10 bg-[#141416]"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-[#FFF7ED]">Human gate queue</h2><p className="mt-1 text-sm text-[#FFF7ED]/45">Pending items never inherit approval from another action.</p></div><Badge variant="orange">HITL</Badge></div><div className="space-y-2">{data.operations?.reviews.length ? data.operations.reviews.slice(0, 4).map((item) => <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-[#0d0d0d] p-3" key={item.id}><div><p className="text-sm font-semibold text-[#FFF7ED]">{item.title}</p><p className="mt-1 text-xs leading-5 text-[#FFF7ED]/40">{item.detail}</p></div><Badge>{item.state}</Badge></div>) : <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-[#FFF7ED]/40"><CheckCircle2 className="mx-auto mb-3 text-green-400" size={20} />Nothing is waiting for review.</div>}</div></Card>
      <Card className="border-white/10 bg-[#141416]"><h2 className="font-bold text-[#FFF7ED]">Chapter pulse</h2><p className="mt-1 text-sm text-[#FFF7ED]/45">Career-first, with compact chapter navigation.</p><div className="mt-5 space-y-3"><Link className="focus-ring flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0d0d] p-4 text-sm font-semibold hover:border-[#e8590c]/40" href="/events"><span className="flex items-center gap-3"><CalendarDays className="text-[#e8590c]" size={18} />Events</span><ArrowUpRight size={16} /></Link><Link className="focus-ring flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0d0d] p-4 text-sm font-semibold hover:border-[#e8590c]/40" href="/leaderboards"><span className="flex items-center gap-3"><Trophy className="text-[#e8590c]" size={18} />Leaderboard</span><ArrowUpRight size={16} /></Link></div></Card>
    </section>
    {data.diagnostics !== undefined && <details className="rounded-lg border border-white/10 bg-[#141416] p-4"><summary className="cursor-pointer text-sm text-[#FFF7ED]/45">Development diagnostics</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0d0d] p-4 font-mono text-xs text-[#FFF7ED]/45">{JSON.stringify(data.diagnostics, null, 2)}</pre></details>}
  </div>;
}

export function DashboardCommandCenter() { return <AppShell><DashboardContent /></AppShell>; }
