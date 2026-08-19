"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarDays, Crown, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useCapabilities } from "@/components/capability-context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import type { ProductViewData } from "@/lib/product/contracts";
import { hasPriorityEnrollment, type UserTier } from "@/lib/permissions";
import { fetchJson, queryKeys } from "@/lib/client-api";

const roleTabs = [
  { value: "general", label: "General" },
  { value: "active", label: "Active" },
  { value: "leaderboard", label: "Elite" },
  { value: "admin", label: "Officer" }
] satisfies Array<{ value: UserTier; label: string }>;

function EventsContent() {
  const [tier, setTier] = useState<UserTier>("active");
  const manifest = useCapabilities();
  const officerPortal = manifest.portal.audience === "officer";
  const effectiveTier = officerPortal ? tier : manifest.portal.userTier;
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: queryKeys.product("dashboard"), queryFn: () => fetchJson<ProductViewData>("/api/product/dashboard", { cache: "no-store" }) });
  const data = dashboard.data || null;
  const priority = hasPriorityEnrollment(effectiveTier);
  const events = data?.events || [];
  const toggle = useMutation({
    mutationFn: (id: string) => fetchJson("/api/product/demo-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_event", id }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.product("dashboard") }); toast.success("Synthetic event registration updated."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Event update failed."),
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-tour="events-heading">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em]">Unified Events Matrix</h1>
          <p className="mt-2 text-muted">Upcoming workshops, clinics, hackathons, and chapter activities.</p>
        </div>
        <div data-tour="events-role">{officerPortal ? <SegmentedTabs items={roleTabs} onChange={setTier} value={tier} /> : <Badge variant="orange">{effectiveTier === "general" ? "Member access" : "Priority member"}</Badge>}</div>
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
              ) : effectiveTier === "active" ? (
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
            {data?.meta.mode === "local_demo" && <Button className="mt-4 w-full" disabled={toggle.isPending} onClick={() => toggle.mutate(event.id)} size="sm" variant={event.registered ? "secondary" : "primary"}>{event.registered ? "Leave synthetic event" : "Join synthetic event"}</Button>}
          </Card>
        ))}
      </section>
    </>
  );
}

export default function EventsPage() {
  return <AppShell><EventsContent /></AppShell>;
}
