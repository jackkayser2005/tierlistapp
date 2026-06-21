"use client";

import * as React from "react";
import { Trophy, Crown, Users, RotateCcw, Zap, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRankForge } from "@/lib/store";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { usePeerRating } from "@/hooks/use-peer-rating";
import { buildItemLeaderboard } from "@/lib/scoring";
import { PEER_TIER_COLORS } from "@/lib/peer-rating";
import { readableTextOn } from "@/lib/tierlist";
import { Button } from "@/components/ui/button";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Leaderboard({ className }: { className?: string }) {
  const unrankedCount = useRankForge((s) => s.unranked.length);
  const bankedScores = useRankForge((s) => s.bankedScores);
  const resetScores = useRankForge((s) => s.resetScores);
  const restoreScores = useRankForge((s) => s.restoreScores);
  const { members, status, isHost } = useMultiplayer();
  const {
    rating,
    canControl,
    startRatingRound,
    endRatingRound,
    cancelRatingRound,
  } = usePeerRating();

  const rows = React.useMemo(
    () => buildItemLeaderboard(bankedScores),
    [bankedScores]
  );

  const canManage = status !== "connected" || isHost;
  const hasStandings = rows.length > 0;
  const inRoom = status === "connected";
  const needsMorePlayers = inRoom && members.length < 2;

  const handleReset = () => {
    if (!hasStandings) return;
    const prev = { ...bankedScores };
    resetScores();
    toast.success("Standings cleared", {
      action: { label: "Undo", onClick: () => restoreScores(prev) },
      duration: 6000,
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="rf-section-label">standings</span>
        <Trophy className="size-3.5 text-amber-300/70" />
      </div>

      {!inRoom ? (
        <div className="rf-inset rounded-xl p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground/80">
            <Users className="size-3.5 shrink-0 text-violet-300" />
            Join a live room
          </p>
          <p className="mt-1.5">
            Add image cards to Unranked, optionally link them to players, then
            run an anonymous rating round.
          </p>
        </div>
      ) : needsMorePlayers ? (
        <div className="rf-inset rounded-xl p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground/80">Waiting for players</p>
          <p className="mt-1.5">
            Invite at least one friend to start rating rounds.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rf-inset rounded-xl p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground/80">No standings yet</p>
          <p className="mt-1.5">
            Put cards in Unranked, link them to players if you want, then start
            a rating round. Results land on the board as tier placements.
          </p>
        </div>
      ) : (
        <div className="rf-inset space-y-1.5 rounded-xl p-2.5">
          {rows.map((row, i) => {
            const isLeader = i === 0;
            const tierColor = PEER_TIER_COLORS[row.tier];
            const tierText = readableTextOn(tierColor);
            return (
              <div
                key={row.itemId}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-lg p-2"
              >
                <div
                  className="absolute inset-0 rounded-lg opacity-30"
                  style={{
                    background: `linear-gradient(90deg, ${row.linkedPlayerColor ?? "#64748b"}22, transparent 70%)`,
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
                  {row.imageUrl ? (
                    <img
                      src={row.imageUrl}
                      alt={row.label}
                      className="size-8 shrink-0 rounded-lg object-cover ring-2 ring-background"
                    />
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] ring-2 ring-background">
                      <ImageIcon className="size-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {row.label}
                    </p>
                    {row.linkedPlayerName ? (
                      <p className="text-[10px] text-muted-foreground">
                        {row.linkedPlayerName}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span
                  className="relative grid min-w-[2.25rem] place-items-center rounded-lg px-2 py-1 text-lg font-black uppercase leading-none"
                  style={{ backgroundColor: tierColor, color: tierText }}
                >
                  {row.tier}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canManage && inRoom && !needsMorePlayers ? (
        <div className="space-y-2">
          {rating.active ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={cancelRatingRound}
              >
                Cancel round
              </Button>
              <Button
                size="sm"
                className="rf-btn-accent"
                onClick={endRatingRound}
              >
                <Zap className="size-3.5" /> Finish round
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="rf-btn-accent w-full"
              onClick={startRatingRound}
              disabled={unrankedCount === 0}
            >
              <Users className="size-3.5" />
              {unrankedCount > 0
                ? `Rate ${unrankedCount} card${unrankedCount === 1 ? "" : "s"}`
                : "Add cards to Unranked first"}
            </Button>
          )}
          {hasStandings ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleReset}
            >
              <RotateCcw className="size-3.5" />
              Reset standings
            </Button>
          ) : null}
        </div>
      ) : rating.active ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          Rating round in progress — check the popup to submit your picks.
        </p>
      ) : null}
    </div>
  );
}
