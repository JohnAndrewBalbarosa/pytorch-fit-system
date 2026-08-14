"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Server, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CapabilityKey } from "@/lib/capabilities";
import { CapabilityGate, CapabilityStatus } from "./capability-gate";
import { useCapability } from "./capability-context";

type ServiceWorkspaceProps = { title: string; eyebrow: string; description: string; endpoint: string; safety: string; capabilityKey: CapabilityKey };

function ServiceContent({ title, eyebrow, description, endpoint, safety, capabilityKey }: ServiceWorkspaceProps) {
  const capability = useCapability(capabilityKey);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (capability.state === "locked") return;
    fetch(endpoint).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(String(value.error || "Service request failed"));
      setPayload(value);
    }).catch((reason) => setError(String(reason.message || reason)));
  }, [capability.state, endpoint]);
  const entries = payload ? Object.entries(payload).slice(0, 8) : [];
  return <>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4" data-tour="page-heading"><div><p className="data-label mb-2 text-xs uppercase tracking-widest text-accent">{eyebrow}</p><h1 className="text-3xl font-bold tracking-[-0.02em]">{title}</h1><p className="mt-2 max-w-3xl text-muted">{description}</p></div><span data-tour="service-status"><Badge variant={payload ? "success" : "orange"}>{payload ? <CheckCircle2 size={14} /> : <Server size={14} />}{payload ? "Service connected" : "Checking service"}</Badge></span></header>
    <Card className="mb-4 border-accent/25 bg-accentSoft" data-tour="permission-boundary"><div className="flex gap-3"><ShieldCheck className="mt-0.5 flex-none text-accent" size={20} /><div><strong>Permission boundary</strong><p className="mt-1 text-sm text-muted">{safety}</p></div></div></Card>
    <div className="mb-4"><CapabilityStatus capabilityKey={capabilityKey} /></div>
    <CapabilityGate capabilityKey={capabilityKey}><div data-tour="service-data">{error ? <Card className="bg-surface"><div className="flex gap-3"><AlertTriangle className="flex-none text-accent" /><div><CardTitle>Local service unavailable</CardTitle><p className="mt-2 text-sm text-muted">{error} Start the FastAPI service to load persisted workflow state.</p></div></div></Card> :
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{entries.map(([key, value]) => <Card className="bg-surface" key={key}><CardHeader><div><CardTitle className="capitalize">{key.replaceAll("_", " ")}</CardTitle><CardDescription>Live service contract</CardDescription></div></CardHeader><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-elevated p-3 font-mono text-xs text-muted">{JSON.stringify(value, null, 2)}</pre></Card>)}</section>}</div>
    </CapabilityGate>
  </>;
}

export function ServiceWorkspace(props: ServiceWorkspaceProps) {
  return <AppShell><ServiceContent {...props} /></AppShell>;
}
