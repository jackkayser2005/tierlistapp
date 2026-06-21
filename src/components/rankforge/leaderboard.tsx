"use client";

import * as React from "react";
import { Trophy, Crown, Users, RotateCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRankForge } from "@/lib/store";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { usePeerRating } from "@/hooks/use-peer-rating";
import { buildPlayerLeaderboard } from "@/lib/scoring";
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
    () => buildPlayerLeaderboard(bankedScores, members),
    [bankedScores, members]
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
            Standings come from anonymous peer ratings — everyone privately
            rates each player, then the group sees tier ranks only.
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
            The host starts a rating round. Everyone rates each player in
            private — results show as tier ranks (S through D).
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
                key={row.userId}
                className="relative flex items-center gap-2.5 overflow-hidden rounded-lg p-2"
              >
                <div
                  className="absolute inset-0 rounded-lg opacity-30"
                  style={{
                    background: `linear-gradient(90deg, ${row.color}22, transparent 70%)`,
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
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-background"
                    style={{ backgroundColor: row.color }}
                  >
                    {initials(row.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {row.name}
                    </p>
                    {row.rounds > 1 ? (
                      <p className="text-[10px] text-muted-foreground">
                        {row.rounds} rounds played
                      </p>
                    ) : null}
                  </div>
                </div>
                <span
                  className="relative grid min-w-[2.25rem] place-items-center rounded-lg px-2 py-1 text-lg font-black uppercase leading-none"
                  style={{ backgroundColor: tierColor, color: tierText }}
                  title={`Tier ${row.tier}`}
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
            >
              <Users className="size-3.5" />
              Start rating round
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
