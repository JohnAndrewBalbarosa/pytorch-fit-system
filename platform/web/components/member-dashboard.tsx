"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, CalendarDays, FileCheck2, Trophy, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProductViewData } from "@/lib/product/contracts";
import { fetchJson, queryKeys } from "@/lib/client-api";

const destinations = [
  { href: "/career/evidence", label: "Career Evidence", detail: "Review and approve your source-backed achievements.", icon: UserRound },
  { href: "/career/resumes", label: "Resume Studio", detail: "Preview role-specific documents fitted to the page.", icon: FileCheck2 },
  { href: "/jobs/opportunities", label: "Opportunities", detail: "Inspect evidence-backed job matches and next steps.", icon: BriefcaseBusiness },
  { href: "/dashboard/profile", label: "Personal profile", detail: "See your member progress and skill signals.", icon: Trophy },
];

export function MemberDashboard() {
  const query = useQuery({
    queryKey: queryKeys.product("dashboard"),
    queryFn: () => fetchJson<ProductViewData>("/api/product/dashboard", { cache: "no-store" }),
  });
  const data = query.data;
  const upcoming = data?.events?.slice(0, 3) || [];
  const opportunities = data?.opportunities?.slice(0, 3) || [];
  return (
    <AppShell>
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#141416] p-5 lg:p-7" data-testid="member-dashboard" data-tour="member-overview">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><Badge variant="orange">Member workspace</Badge><h1 className="mt-4 text-3xl font-extrabold tracking-[-0.02em]">Your growth, evidence, and opportunities.</h1><p className="mt-3 max-w-2xl leading-7 text-[#FFF7ED]/55">A personal view of career evidence, resume readiness, chapter events, and public-safe progress.</p></div>
            <Badge variant={query.error ? "warning" : "success"}>{query.error ? "Data unavailable" : data ? data.meta.label : "Loading"}</Badge>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="member-destinations">{destinations.map(({ href, label, detail, icon: Icon }) => <Link className="focus-ring group rounded-lg" href={href} key={href}><Card className="h-full min-h-48 border-white/10 bg-[#141416] group-hover:border-[#e8590c]/40"><Icon className="text-[#e8590c]" size={22} /><h2 className="mt-5 font-bold">{label}</h2><p className="mt-2 text-sm leading-6 text-[#FFF7ED]/45">{detail}</p><span className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#fb923c]">Open <ArrowRight size={14} /></span></Card></Link>)}</section>
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-[#141416]" data-tour="member-events"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Upcoming chapter events</h2><p className="mt-1 text-sm text-[#FFF7ED]/45">Your available workshops and activities.</p></div><CalendarDays className="text-[#e8590c]" /></div><div className="space-y-2">{upcoming.map((event) => <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0d0d] p-3" key={event.id}><div><p className="text-sm font-semibold">{event.title}</p><p className="mt-1 text-xs text-[#FFF7ED]/45">{event.date} · {event.department}</p></div>{event.registered && <Badge variant="success">Joined</Badge>}</div>)}</div></Card>
          <Card className="border-white/10 bg-[#141416]" data-tour="member-opportunities"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Personal opportunity shortlist</h2><p className="mt-1 text-sm text-[#FFF7ED]/45">Matches use verified evidence and preserve unknowns.</p></div><BriefcaseBusiness className="text-[#e8590c]" /></div><div className="space-y-2">{opportunities.map((item) => <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0d0d] p-3" key={item.id}><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#FFF7ED]/45">{item.company} · {item.workMode}</p></div><Badge>{item.fit}% fit</Badge></div>)}</div></Card>
        </section>
      </div>
    </AppShell>
  );
}
