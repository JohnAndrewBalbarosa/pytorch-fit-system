"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarDays, Crown, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import type { ProductViewData } from "@/lib/product/contracts";
import { hasPriorityEnrollment, type UserTier } from "@/lib/permissions";

const roleTabs = [
  { value: "general", label: "General" },
  { value: "active", label: "Active" },
  { value: "leaderboard", label: "Elite" },
  { value: "admin", label: "Officer" }
] satisfies Array<{ value: UserTier; label: string }>;

export default function EventsPage() {
  const [tier, setTier] = useState<UserTier>("active");
  const [data, setData] = useState<ProductViewData | null>(null);
  const priority = hasPriorityEnrollment(tier);
  useEffect(() => { void fetch("/api/product/dashboard", { cache: "no-store" }).then((response) => response.json()).then(setData); }, []);
  const events = data?.events || [];
  const toggle = async (id: string) => {
    const response = await fetch("/api/product/demo-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_event", id }) });
    if (response.ok) setData(await fetch("/api/product/dashboard", { cache: "no-store" }).then((result) => result.json()));
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-tour="events-heading">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em]">Unified Events Matrix</h1>
          <p className="mt-2 text-muted">Upcoming workshops, clinics, hackathons, and chapter activities.</p>
        </div>
        <div data-tour="events-role"><SegmentedTabs items={roleTabs} onChange={setTier} value={tier} /></div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="events-grid">
        {events.map((event) => (
          <Card className="flex flex-col bg-surface" key={event.id}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accentSoft text-accent">
                <CalendarDays size={20} />
              </div>
              {priority ? (
                <Badge variant="orange"><Crown size={14} /> Priority seat</Badge>
              ) : tier === "active" ? (
                <Badge variant="success"><Bell size={14} /> Early access</Badge>
              ) : (
                <Badge>Standard queue</Badge>
              )}
            </div>
            <h2 className="text-lg font-bold tracking-[-0.02em]">{event.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{event.department}</p>
            <div className="mt-4 space-y-3 rounded-lg border border-border bg-elevated p-3 text-xs leading-5"><p><strong>Learning objective:</strong> {event.learningObjective}</p><p><strong>Expected output:</strong> {event.output}</p></div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <div>
                <p className="data-label text-sm">{event.date}</p>
                <p className="text-xs text-muted">{event.type}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <Users size={16} />
                {event.seats}
              </div>
            </div>
            {data?.meta.mode === "local_demo" && <Button className="mt-4 w-full" onClick={() => void toggle(event.id)} size="sm" variant={event.registered ? "secondary" : "primary"}>{event.registered ? "Leave synthetic event" : "Join synthetic event"}</Button>}
          </Card>
        ))}
      </section>
    </AppShell>
  );
}
