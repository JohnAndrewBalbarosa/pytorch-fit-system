"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/tabs";
import type { LeaderboardEntry, ProductViewData } from "@/lib/product/contracts";
import { formatRank } from "@/lib/utils";

type Board = "global" | "cv" | "dl";

const tabs = [
  { value: "global", label: "Global Node Rank" },
  { value: "cv", label: "Computer Vision Specialist" },
  { value: "dl", label: "Deep Learning Peer Leaders" }
] satisfies Array<{ value: Board; label: string }>;

export default function LeaderboardsPage() {
  const [board, setBoard] = useState<Board>("global");
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardEntry[]>([]);
  useEffect(() => { void fetch("/api/product/dashboard", { cache: "no-store" }).then((response) => response.json()).then((data: ProductViewData) => setLeaderboardRows(data.leaderboard || [])); }, []);
  const rows = useMemo(() => {
    if (board === "cv") return leaderboardRows.filter((row) => row.track.includes("Vision"));
    if (board === "dl") return leaderboardRows.filter((row) => row.track.includes("Deep"));
    return leaderboardRows;
  }, [board, leaderboardRows]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-tour="leaderboards-heading">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em]">Categorized Leaderboards Browser</h1>
          <p className="mt-2 text-muted">Public-safe ranking from event streaks and reviewed activity signals.</p>
        </div>
        <div data-tour="leaderboards-tabs"><SegmentedTabs items={tabs} onChange={setBoard} value={board} /></div>
      </div>

      <Card className="overflow-hidden bg-surface p-0" data-tour="leaderboards-table">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Trophy className="text-accent" size={20} />
            <h2 className="font-bold">Rank table</h2>
          </div>
          <Badge variant="orange">
            <ArrowDownUp size={14} />
            Score desc
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-elevated text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Rank</th>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Track</th>
                <th className="px-4 py-3 font-semibold">Points</th>
                <th className="px-4 py-3 font-semibold">Streak</th>
                <th className="px-4 py-3 font-semibold">Skill badges</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className={`border-t border-border transition-all duration-300 ease-in-out hover:bg-elevated ${row.currentUser ? "bg-accentSoft" : ""}`} key={row.name}>
                  <td className="data-label px-4 py-3 text-accent">{formatRank(row.rank)}</td>
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td className="px-4 py-3 text-muted">{row.track}</td>
                  <td className="data-label px-4 py-3">{row.points.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.streak} events</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {row.badges.map((badge) => (
                        <Badge key={badge}>{badge}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
