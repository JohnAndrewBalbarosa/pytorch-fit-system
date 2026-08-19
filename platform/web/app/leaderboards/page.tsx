"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDownUp, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaderboardEntry, ProductViewData } from "@/lib/product/contracts";
import { formatRank } from "@/lib/utils";
import { fetchJson, queryKeys } from "@/lib/client-api";

type Board = "global" | "cv" | "dl";

const tabs = [
  { value: "global", label: "Global Node Rank" },
  { value: "cv", label: "Computer Vision Specialist" },
  { value: "dl", label: "Deep Learning Peer Leaders" }
] satisfies Array<{ value: Board; label: string }>;

const leaderboardFeatures = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const columnHelper = createColumnHelper<typeof leaderboardFeatures, LeaderboardEntry>();
const leaderboardColumns = columnHelper.columns([
  columnHelper.accessor("rank", { header: "Rank" }), columnHelper.accessor("name", { header: "Member" }), columnHelper.accessor("track", { header: "Track" }),
  columnHelper.accessor("points", { header: "Points" }), columnHelper.accessor("streak", { header: "Streak" }), columnHelper.accessor("badges", { header: "Skill badges" }),
]);
const EMPTY_LEADERBOARD: LeaderboardEntry[] = [];

export default function LeaderboardsPage() {
  const [board, setBoard] = useState<Board>("global");
  const dashboard = useQuery({ queryKey: queryKeys.product("dashboard"), queryFn: () => fetchJson<ProductViewData>("/api/product/dashboard", { cache: "no-store" }) });
  const leaderboardRows = dashboard.data?.leaderboard || EMPTY_LEADERBOARD;
  const rows = useMemo(() => {
    if (board === "cv") return leaderboardRows.filter((row) => row.track.includes("Vision"));
    if (board === "dl") return leaderboardRows.filter((row) => row.track.includes("Deep"));
    return leaderboardRows;
  }, [board, leaderboardRows]);
  const table = useTable({ columns: leaderboardColumns, data: rows, features: leaderboardFeatures, initialState: { sorting: [{ id: "points", desc: true }] } });

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
          <Table className="min-w-[760px]">
            <TableHeader><TableRow>{table.getHeaderGroups()[0].headers.map((header) => <TableHead key={header.id}>{String(header.column.columnDef.header)}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(({ original: row }) => (
                <TableRow className={row.currentUser ? "bg-accentSoft" : ""} key={row.name}>
                  <TableCell className="data-label text-accent">{formatRank(row.rank)}</TableCell>
                  <TableCell className="font-semibold">{row.name}</TableCell>
                  <TableCell className="text-muted">{row.track}</TableCell>
                  <TableCell className="data-label">{row.points.toLocaleString()}</TableCell>
                  <TableCell>{row.streak} events</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {row.badges.map((badge) => (
                        <Badge key={badge}>{badge}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppShell>
  );
}
