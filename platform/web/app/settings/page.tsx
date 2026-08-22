"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, LockKeyhole, UserCog } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { fetchJson } from "@/lib/client-api";
import type { LeaderboardIdentitySettings } from "@/lib/member-command-contracts";

type Mode = LeaderboardIdentitySettings["mode"];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["leaderboard-identity"], queryFn: () => fetchJson<LeaderboardIdentitySettings>("/api/member/leaderboard-identity", { cache: "no-store" }) });
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<Mode>("nickname");
  const [consent, setConsent] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "available" | "unavailable">("idle");
  useEffect(() => { if (query.data) { setUsername(query.data.username); setMode(query.data.mode); setConsent(query.data.realNameConsent); } }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => fetchJson<LeaderboardIdentitySettings>("/api/member/leaderboard-identity", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, mode, realNameConsent: consent }) }),
    onSuccess: (saved) => { queryClient.setQueryData(["leaderboard-identity"], saved); queryClient.invalidateQueries({ queryKey: ["member-leaderboard"] }); toast.success("Leaderboard identity saved."); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Settings could not be saved."),
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
      <div><h1 className="text-3xl font-bold tracking-[-0.02em]">Member identity settings</h1><p className="mt-2 text-muted">Control the only identity label other members can see on competitive ladders.</p></div>
      <Badge variant="orange">Private by default</Badge>
    </div>
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
