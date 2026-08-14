"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  Flame,
  Home,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Search,
  Settings,
  Shield,
  Trophy,
  Unplug,
  UserRound,
  X
} from "lucide-react";
import { useState } from "react";
import type { CapabilityKey } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { CapabilityProvider, useCapabilities } from "./capability-context";
import { ProductTourController, requestProductTour } from "./product-tour";
import { SignOutButton } from "./sign-out-button";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const navItems: Array<{ href: string; label: string; icon: typeof LayoutDashboard; capability?: CapabilityKey }> = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/career/evidence", label: "Career Evidence", icon: UserRound, capability: "evidence_read" },
  { href: "/career/resumes", label: "Resume Studio", icon: BarChart3, capability: "resume_read" },
  { href: "/jobs/analytics", label: "Job Analytics", icon: Search, capability: "analytics_read" },
  { href: "/jobs/automation", label: "Job Automation", icon: Bot, capability: "application_draft" },
  { href: "/jobs/opportunities", label: "Opportunities", icon: BriefcaseBusiness, capability: "job_discovery" },
  { href: "/connections", label: "Connections", icon: Unplug, capability: "connections" },
  { href: "/events", label: "Chapter Events", icon: CalendarDays },
  { href: "/leaderboards", label: "Leaderboards", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings }
];

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const manifest = useCapabilities();

  const sidebar = (
    <aside className="flex h-full w-72 flex-col border-r border-white/10 bg-[#0d0d0d] p-4 text-[#FFF7ED]">
      <div className="mb-6 flex items-center justify-between">
        <Link className="focus-ring rounded-lg" href="/">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#e8590c] to-[#ff8a3d] shadow-lg shadow-[#e8590c]/30">
              <Flame size={20} />
            </div>
            <div>
              <p className="font-mono text-sm font-bold tracking-[-0.02em]">PYTORCH.FIT</p>
              <p className="text-xs text-[#FFF7ED]/45">Campus Engine</p>
            </div>
          </div>
        </Link>
        <Button aria-label="Close menu" className="lg:hidden" onClick={() => setOpen(false)} size="icon" type="button" variant="ghost">
          <X size={18} />
        </Button>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const capability = item.capability ? manifest.capabilities[item.capability] : undefined;
          const isLocked = capability?.state === "locked";
          const content = <><Icon size={18} />{item.label}{isLocked && <LockKeyhole className="ml-auto" size={14} />}</>;
          if (isLocked) return (
            <span
              aria-disabled="true"
              className="flex h-10 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#FFF7ED]/25"
              key={item.href}
              title={capability.reason}
            >
              {content}
            </span>
          );
          return (
            <Link
              className={cn(
                "focus-ring flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-all duration-300 ease-in-out",
                active ? "bg-[#e8590c] text-white" : "text-[#FFF7ED]/55 hover:bg-white/[0.06] hover:text-[#FFF7ED]"
              )}
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              {content}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#FFF7ED]/40">Current cycle</p>
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[68%] rounded-full bg-[#e8590c]" />
        </div>
        <p className="mt-2 text-xs text-[#FFF7ED]/45">Career evidence and application readiness.</p>
      </div>
      <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Shield className="text-[#e8590c]" size={16} />
          <p className="text-sm font-semibold">Protected data gateway</p>
        </div>
        <p className="text-xs leading-5 text-[#FFF7ED]/45">Local and Supabase providers share one server-side contract.</p>
      </div>
      <Button
        className="mt-3 w-full justify-start gap-3"
        data-tour="tour-help"
        onClick={requestProductTour}
        type="button"
        variant="ghost"
      >
        <CircleHelp size={18} /> Help / Tour
      </Button>
      <SignOutButton />
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-[#FFF7ED]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#0b0b0c]/90 px-4 backdrop-blur lg:hidden">
        <Button aria-label="Open menu" onClick={() => setOpen(true)} size="icon" type="button" variant="secondary">
          <Menu size={18} />
        </Button>
        <Badge variant="orange">Prototype UI</Badge>
        <Button aria-label="Replay page tour" data-tour="tour-help" onClick={requestProductTour} size="icon" type="button" variant="secondary">
          <CircleHelp size={18} />
        </Button>
      </header>
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu backdrop" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} type="button" />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}
      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
      <ProductTourController />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <CapabilityProvider><AppShellContent>{children}</AppShellContent></CapabilityProvider>;
}
