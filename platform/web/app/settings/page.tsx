"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Eye, FlaskConical, LockKeyhole, UserCog } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-api";
import type { LeaderboardIdentitySettings } from "@/lib/member-command-contracts";

type Mode = LeaderboardIdentitySettings["mode"];
type LocalAIStatus = { configured: boolean; provider: string; baseUrl: string; model: string; apiKeyPresent: boolean; source: string };

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["leaderboard-identity"], queryFn: () => fetchJson<LeaderboardIdentitySettings>("/api/member/leaderboard-identity", { cache: "no-store" }) });
  const aiQuery = useQuery({ queryKey: ["local-ai-status"], queryFn: () => fetchJson<LocalAIStatus>("/api/backend/local-ai/status", { cache: "no-store" }) });
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<Mode>("nickname");
  const [consent, setConsent] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "available" | "unavailable">("idle");
  const [aiBaseUrl, setAiBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  useEffect(() => { if (query.data) { setUsername(query.data.username); setMode(query.data.mode); setConsent(query.data.realNameConsent); } }, [query.data]);
  useEffect(() => { if (aiQuery.data?.configured) { setAiBaseUrl(aiQuery.data.baseUrl); setAiModel(aiQuery.data.model); } }, [aiQuery.data]);
  const mutation = useMutation({
    mutationFn: () => fetchJson<LeaderboardIdentitySettings>("/api/member/leaderboard-identity", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, mode, realNameConsent: consent }) }),
    onSuccess: (saved) => { queryClient.setQueryData(["leaderboard-identity"], saved); queryClient.invalidateQueries({ queryKey: ["member-leaderboard"] }); toast.success("Leaderboard identity saved."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Settings could not be saved."),
  });
  const aiMutation = useMutation({
    mutationFn: () => fetchJson<LocalAIStatus>("/api/backend/local-ai/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openai-compatible", base_url: aiBaseUrl, model: aiModel, api_key: aiKey || null }) }),
    onSuccess: (saved) => { queryClient.setQueryData(["local-ai-status"], saved); queryClient.invalidateQueries({ queryKey: ["capabilities"] }); setAiKey(""); toast.success("Local AI settings saved. Resume and scraper gates are now enabled."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "AI settings could not be saved."),
  });
  const testMutation = useMutation({
    mutationFn: () => fetchJson<{ ok: boolean; response: string }>("/api/backend/local-ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    onSuccess: (result) => toast.success(`AI connection passed: ${result.response || "READY"}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "AI connection test failed."),
  });
  async function checkAvailability() {
    try {
      const result = await fetchJson<{ available: boolean }>(`/api/member/leaderboard-identity?username=${encodeURIComponent(username)}`, { cache: "no-store" });
      setAvailability(result.available ? "available" : "unavailable");
    } catch { setAvailability("unavailable"); }
  }
  const preview = mode === "anonymous" ? "Member #7A82F (changes each season)" : mode === "real_name" ? consent ? "Your account display name" : "Consent required" : username || "Your username";

  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-tour="settings-heading">
      <div><h1 className="text-3xl font-bold tracking-[-0.02em]">Settings</h1><p className="mt-2 text-muted">Configure private local AI access and member-facing identity controls.</p></div>
      <Badge variant="orange">Private by default</Badge>
    </div>
    <Card className="mb-4 bg-surface">
      <CardHeader><div><CardTitle>AI pipeline connection</CardTitle><CardDescription>A user-supplied OpenAI-compatible endpoint powers UpSkill, resume generation, and scraper planning. The secret is stored only by the local companion and is never returned to the browser.</CardDescription></div><Cpu className="text-accent" /></CardHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant={aiQuery.data?.configured ? "success" : "warning"}>{aiQuery.data?.configured ? "Configured" : "Setup required"}</Badge><span className="text-xs text-muted">OpenAI-compatible HTTP boundary · local servers such as Ollama/LM Studio/vLLM or a remote API</span></div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.7fr_1fr]">
        <div><Label htmlFor="ai-base-url">API base URL</Label><Input id="ai-base-url" onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="http://127.0.0.1:11434/v1" type="url" value={aiBaseUrl} /></div>
        <div><Label htmlFor="ai-model">Model</Label><Input id="ai-model" onChange={(event) => setAiModel(event.target.value)} placeholder="qwen2.5:7b" value={aiModel} /></div>
        <div><Label htmlFor="ai-key">API key</Label><Input autoComplete="off" id="ai-key" onChange={(event) => setAiKey(event.target.value)} placeholder={aiQuery.data?.apiKeyPresent ? "Saved · leave blank to keep" : "Optional for local endpoints"} type="password" value={aiKey} /></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!aiBaseUrl || !aiModel || aiMutation.isPending} onClick={() => aiMutation.mutate()} type="button">{aiMutation.isPending ? "Saving…" : "Save AI connection"}</Button><Button disabled={!aiQuery.data?.configured || testMutation.isPending} onClick={() => testMutation.mutate()} type="button" variant="outline"><FlaskConical size={16} />{testMutation.isPending ? "Testing…" : "Test connection"}</Button><Button asChild variant="outline"><a href="http://127.0.0.1:8000/developer/event-pipeline" rel="noreferrer" target="_blank">Open pipeline workbench</a></Button></div>
    </Card>
    <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]" data-tour="settings-grid">
      <Card className="bg-surface" data-tour="settings-privacy">
        <CardHeader><div><CardTitle>Leaderboard identity</CardTitle><CardDescription>Usernames are unique without regard to case. Revoking real-name consent takes effect on the next leaderboard read.</CardDescription></div><UserCog className="text-accent" /></CardHeader>
        {query.data?.reviewRequired && <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Review the generated username before continuing.</div>}
        <div className="space-y-5">
          <div><Label htmlFor="leaderboard-username">Username</Label><div className="flex gap-2"><Input id="leaderboard-username" maxLength={24} minLength={3} onChange={(event) => { setUsername(event.target.value); setAvailability("idle"); }} pattern="[A-Za-z0-9_-]{3,24}" value={username} /><Button onClick={checkAvailability} type="button" variant="outline">Check</Button></div><p className="mt-2 text-xs text-muted">3–24 characters: letters, numbers, underscore, or hyphen.</p>{availability !== "idle" && <p className={`mt-2 text-xs ${availability === "available" ? "text-success" : "text-warning"}`}>{availability === "available" ? "Username is available." : "Username is invalid or unavailable."}</p>}</div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Display mode</legend><div className="grid gap-2">{([['nickname','Nickname','Show your required username.'],['anonymous','Anonymous','Use a season-scoped Member # label.'],['real_name','Real name','Show your account display name only with consent.']] as const).map(([value,label,detail]) => <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3" key={value}><input checked={mode===value} name="identity-mode" onChange={() => setMode(value)} type="radio" /><span><span className="block font-semibold">{label}</span><span className="text-xs text-muted">{detail}</span></span></label>)}</div></fieldset>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3"><input checked={consent} onChange={(event) => { setConsent(event.target.checked); if (!event.target.checked && mode === "real_name") setMode("nickname"); }} type="checkbox" /><span><span className="block font-semibold">I explicitly consent to real-name leaderboard visibility.</span><span className="text-xs text-muted">Clear this at any time to revoke real-name display immediately.</span></span></label>
          <Button disabled={query.isLoading || mutation.isPending || !username} onClick={() => mutation.mutate()} type="button">{mutation.isPending ? "Saving…" : "Save identity"}</Button>
        </div>
      </Card>
      <div className="space-y-4"><Card className="bg-surface"><CardHeader><div><CardTitle>Member preview</CardTitle><CardDescription>Exactly how your label is intended to appear.</CardDescription></div><Eye className="text-accent" /></CardHeader><div className="rounded-xl border border-accent/30 bg-accentSoft p-5 text-center text-xl font-bold">{preview}</div></Card><Card className="bg-surface"><CardHeader><div><CardTitle>Never included</CardTitle><CardDescription>Leaderboard payloads exclude private career and account data.</CardDescription></div><LockKeyhole className="text-success" /></CardHeader><p className="text-sm leading-6 text-muted">No UUID, email, avatar, bio, department, job history, projects, resumes, evidence text or IDs, source URLs, activity timestamps, or diagnostics.</p></Card></div>
    </section>
  </AppShell>;
}
