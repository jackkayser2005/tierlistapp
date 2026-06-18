"use client";

import * as React from "react";
import { Trophy, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRankForge } from "@/lib/store";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { computeLeaderboard } from "@/lib/scoring";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Leaderboard({ className }: { className?: string }) {
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  const tierItems = useRankForge((s) => s.tierItems);
  const unranked = useRankForge((s) => s.unranked);
  const { members, status } = useMultiplayer();

  const entries = React.useMemo(
    () => computeLeaderboard({ tiers, items, tierItems, unranked, title: "", description: "" }, members),
    [tiers, items, tierItems, unranked, members]
  );

  if (status !== "connected") return null;
  if (entries.length === 0) return null;

  const maxScore = Math.max(1, ...entries.map((e) => e.score));

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="rf-section-label">leaderboard</span>
        <Trophy className="size-3.5 text-amber-300/70" />
      </div>
      <div className="rf-inset space-y-1.5 rounded-xl p-2.5">
        {entries.map((entry, i) => {
          const isLeader = i === 0 && entry.score > 0;
          const pct = (entry.score / maxScore) * 100;
          return (
            <div
              key={entry.userId}
              className="relative flex items-center gap-2.5 overflow-hidden rounded-lg p-2"
            >
              {/* score bar fill */}
              <div
                className="absolute inset-0 rounded-lg transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${entry.avatarColor}25, transparent)`,
                }}
              />
              <div className="relative flex items-center gap-2.5">
                {/* rank */}
                <span
                  className={cn(
                    "w-5 text-center text-xs font-bold",
                    isLeader ? "text-amber-300" : "text-muted-foreground"
                  )}
                >
                  {isLeader ? (
                    <Crown className="mx-auto size-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                {/* avatar */}
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt={entry.avatarLabel}
                    className="size-8 rounded-full object-cover ring-2 ring-background"
                  />
                ) : (
                  <span
                    className="grid size-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-background"
                    style={{ backgroundColor: entry.avatarColor }}
                  >
                    {initials(entry.avatarLabel)}
                  </span>
                )}
                {/* name + count */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {entry.avatarLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {/* score */}
              <span
                className={cn(
                  "relative ml-auto text-lg font-black tabular-nums",
                  isLeader ? "text-amber-300" : "text-foreground"
                )}
              >
                {entry.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
