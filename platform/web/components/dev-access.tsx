"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Code2 } from "lucide-react";

export function DevAccess() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [audience, setAudience] = useState<"member" | "officer">("member");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/dev-session").then((r) => r.json()).then((v) => { setEnabled(Boolean(v.enabled)); setAudience(v.audience === "officer" ? "officer" : "member"); }).catch(() => undefined); }, []);
  if (!enabled) return null;
  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <button
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-[#e8590c]/40 bg-[#e8590c]/10 py-3 text-sm font-semibold text-[#FFF7ED] hover:bg-[#e8590c]/20 disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const response = await fetch("/api/dev-session", { method: "POST" });
          if (response.ok) router.push("/dashboard");
          else setBusy(false);
        }}
        type="button"
      >
        <Code2 size={16} /> {busy ? "Opening local workspace…" : `Enter local ${audience} portal`}
      </button>
      {audience === "member" && <a className="mt-2 flex w-full items-center justify-center rounded-lg border border-white/10 py-2 text-xs text-[#FFF7ED]/60 hover:border-[#e8590c]/40" href="/membership?demo=pending">Preview unpaid membership gate</a>}
      <p className="mt-2 text-center text-xs leading-5 text-[#FFF7ED]/40">Local development only. Automation and submission gates remain enforced.</p>
    </div>
  );
}
