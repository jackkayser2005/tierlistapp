"use client";

import * as React from "react";
import { Trophy, Crown, UserPlus, Flag, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRankForge, type RoundContribution } from "@/lib/store";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { computeLeaderboard } from "@/lib/scoring";
import { Button } from "@/components/ui/button";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Row {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
  total: number;
  roundScore: number;
  totalItems: number;
}

export function Leaderboard({ className }: { className?: string }) {
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const tierItems = useRankForge((s) => s.tierItems);
  const unranked = useRankForge((s) => s.unranked);
  const bankedScores = useRankForge((s) => s.bankedScores);
  const bankRound = useRankForge((s) => s.bankRound);
  const resetScores = useRankForge((s) => s.resetScores);
  const restoreScores = useRankForge((s) => s.restoreScores);
  const { assignableMembers, status, isHost } = useMultiplayer();

  // Live (current-round) scores derived from the board's current assignments.
  const live = React.useMemo(
    () =>
      computeLeaderboard(
        {
          tiers,
          items,
          tierItems,
          unranked,
          title: "",
          description: "",
          bankedScores: {},
        },
        assignableMembers
      ),
    [tiers, items, tierItems, unranked, assignableMembers]
  );

  // Merge banked totals with the live round into a single ranked list.
  const rows = React.useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const [id, b] of Object.entries(bankedScores)) {
      map.set(id, {
        userId: id,
        name: b.name,
        color: b.color,
        total: b.score,
        roundScore: 0,
        totalItems: b.itemCount,
      });
    }
    for (const e of live) {
      const existing = map.get(e.userId);
      if (existing) {
        existing.total += e.score;
        existing.roundScore = e.score;
        existing.totalItems += e.itemCount;
        existing.name = e.avatarLabel;
        existing.color = e.avatarColor;
        if (e.avatarUrl) existing.avatarUrl = e.avatarUrl;
      } else {
        map.set(e.userId, {
          userId: e.userId,
          name: e.avatarLabel,
          color: e.avatarColor,
          avatarUrl: e.avatarUrl,
          total: e.score,
          roundScore: e.score,
          totalItems: e.itemCount,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.total - a.total || b.totalItems - a.totalItems
    );
  }, [bankedScores, live]);

  // Solo or host can manage rounds; guests just watch the synced board.
  const canManage = status !== "connected" || isHost;
  const roundPoints = live.reduce((sum, e) => sum + e.score, 0);
  const hasBanked = Object.keys(bankedScores).length > 0;
  const maxScore = Math.max(1, ...rows.map((r) => r.total));

  const handleEndRound = () => {
    if (roundPoints <= 0) {
      toast.info("Nothing to bank yet", {
        description: "Assign cards to players to earn round points first.",
      });
      return;
    }
    const contributions: RoundContribution[] = live.map((e) => ({
      id: e.userId,
      score: e.score,
      itemCount: e.itemCount,
      name: e.avatarLabel,
      color: e.avatarColor,
    }));
    const winner = [...live].sort((a, b) => b.score - a.score)[0];
    bankRound(contributions);
    toast.success(
      winner ? `🏆 ${winner.avatarLabel} won the round (+${winner.score})` : "Round banked",
      {
        description: "Scores added to the totals. New round started — assignments cleared.",
      }
    );
  };

  const handleReset = () => {
    if (!hasBanked && roundPoints <= 0) return;
    const prev = { ...bankedScores };
    resetScores();
    toast.success("Leaderboard cleared", {
      description: "All totals reset to zero.",
      action: { label: "Undo", onClick: () => restoreScores(prev) },
      duration: 6000,
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="rf-section-label">leaderboard</span>
        <Trophy className="size-3.5 text-amber-300/70" />
      </div>

      {rows.length === 0 ? (
        <div className="rf-inset rounded-xl p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground/80">
            <UserPlus className="size-3.5 shrink-0 text-violet-300" />
            No scores yet
          </p>
          <p className="mt-1.5">
            Hover a card → tap the{" "}
            <span className="font-semibold text-foreground/70">+</span> button
            to assign it to a player. Points come from the tier the card is in
            (S = 5pts, A = 4pts…). End a round to bank totals.
          </p>
        </div>
      ) : (
        <div className="rf-inset space-y-1.5 rounded-xl p-2.5">
          {rows.map((row, i) => {
            const isLeader = i === 0 && row.total > 0;
            const pct = (row.total / maxScore) * 100;
            return (
              <div
                key={row.userId}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-lg p-2"
              >
                <div
                  className="absolute inset-0 rounded-lg transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${row.color}25, transparent)`,
                  }}
                />
                <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className={cn(
                      "w-5 shrink-0 text-center text-xs font-bold",
                      isLeader ? "text-amber-300" : "text-muted-foreground"
                    )}
                  >
                    {isLeader ? <Crown className="mx-auto size-3.5" /> : i + 1}
                  </span>
                  {row.avatarUrl ? (
                    <img
                      src={row.avatarUrl}
                      alt={row.name}
                      className="size-8 shrink-0 rounded-full object-cover ring-2 ring-background"
                    />
                  ) : (
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-background"
                      style={{ backgroundColor: row.color }}
                    >
                      {initials(row.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {row.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {row.totalItems} item{row.totalItems === 1 ? "" : "s"}
                      {row.roundScore > 0 ? (
                        <span className="text-emerald-300/90">
                          {" "}
                          · +{row.roundScore} this round
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "relative shrink-0 text-lg font-black tabular-nums",
                    isLeader ? "text-amber-300" : "text-foreground"
                  )}
                >
                  {row.total}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canManage && (rows.length > 0 || roundPoints > 0) ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 flex-1 gap-1.5 text-xs"
            onClick={handleEndRound}
            disabled={roundPoints <= 0}
          >
            <Flag className="size-3.5" />
            End round
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={handleReset}
            disabled={!hasBanked && roundPoints <= 0}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}
