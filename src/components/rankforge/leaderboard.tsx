"use client";

import * as React from "react";
import {
  Trophy,
  Vote as VoteIcon,
  Zap,
  Info,
  RotateCcw,
  ImageIcon,
  ChevronDown,
  LayoutGrid,
  Users,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRankForge } from "@/lib/store";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { useVoting } from "@/hooks/use-voting";
import { useVotingMode } from "./voting-context";
import {
  buildPendingVoteItems,
  buildStandingsRows,
  groupStandingsByTierRow,
} from "@/lib/scoring";
import { readableTextOn } from "@/lib/tierlist";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

function CardThumb({
  label,
  imageUrl,
  className,
}: {
  label: string;
  imageUrl?: string;
  className?: string;
}) {
  const [imgError, setImgError] = React.useState(false);
  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={label}
        onError={() => setImgError(true)}
        className={cn(
          "size-8 shrink-0 rounded-lg object-cover ring-2 ring-background",
          className
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] ring-2 ring-background",
        className
      )}
    >
      <ImageIcon className="size-3.5 text-muted-foreground" />
    </span>
  );
}

function HowItWorks({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rf-inset overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-xs font-medium text-foreground/85">
          How vote &amp; standings work
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <ol className="space-y-2 border-t border-white/[0.06] px-3 pb-3 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground/80">1.</strong> Add cards to
            Unranked. Link a player on a card if you want — optional.
          </li>
          <li>
            <strong className="text-foreground/80">2.</strong> Host starts a
            vote on the next card. Everyone picks a tier in the popup — tallies
            are visible live.
          </li>
          <li>
            <strong className="text-foreground/80">3.</strong> Host ends the
            vote. The winning tier moves the card onto the board{" "}
            <em>and</em> adds it to standings below.
          </li>
          <li>
            <strong className="text-foreground/80">4.</strong> Repeat until
            Unranked is empty. Drag cards anytime to adjust after discussion.
          </li>
        </ol>
      ) : null}
    </div>
  );
}

function LiveVoteStrip() {
  const tiers = useRankForge((s) => s.tiers);
  const { vote, myVote } = useVoting();
  if (!vote.active || !vote.item) return null;

  const totalVotes = Object.values(vote.tally).reduce((a, b) => a + b, 0);
  const leadingTierId = Object.entries(vote.tally).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-200">
        <span className="rf-live-dot size-1.5 rounded-full bg-violet-400" />
        Live vote — {vote.item.label}
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {tiers.map((tier) => {
          const count = vote.tally[tier.id] ?? 0;
          const isLeading = leadingTierId === tier.id && count > 0;
          const isMine = myVote === tier.id;
          return (
            <span
              key={tier.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold",
                isLeading && "ring-1 ring-white/40"
              )}
              style={{
                backgroundColor: tier.color,
                color: readableTextOn(tier.color),
              }}
            >
              {tier.name}
              <span className="opacity-80">{count || "—"}</span>
              {isMine ? <Check className="size-2.5" /> : null}
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {vote.voterCount} of {vote.totalPeers} voted
        {totalVotes > 0 ? ` · ${totalVotes} picks total` : ""}
      </p>
    </div>
  );
}

function StandingsRowView({
  row,
  rank,
}: {
  row: ReturnType<typeof buildStandingsRows>[number];
  rank: number;
}) {
  const tierText = readableTextOn(row.tierColor);
  return (
    <div className="relative flex items-center gap-2.5 overflow-hidden rounded-lg p-2">
      <div
        className="absolute inset-0 rounded-lg opacity-25"
        style={{
          background: `linear-gradient(90deg, ${row.linkedPlayerColor ?? row.tierColor}33, transparent 70%)`,
        }}
      />
      <span className="relative w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {rank}
      </span>
      <CardThumb label={row.label} imageUrl={row.imageUrl} />
      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{row.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
          {row.linkedPlayerName ? <span>{row.linkedPlayerName}</span> : null}
          {row.linkedPlayerName ? <span className="opacity-40">·</span> : null}
          <span className="inline-flex items-center gap-1">
            <LayoutGrid className="size-2.5 opacity-70" />
            {row.boardLabel}
          </span>
          <span className="opacity-40">·</span>
          <span>
            {row.lastVoteCount} vote{row.lastVoteCount === 1 ? "" : "s"} to win
          </span>
        </p>
      </div>
      <span
        className="relative grid min-w-[2.5rem] place-items-center rounded-lg px-2 py-1 text-sm font-black uppercase leading-none"
        style={{ backgroundColor: row.tierColor, color: tierText }}
        title="Winning tier from group vote"
      >
        {row.tierName}
      </span>
    </div>
  );
}

/** Unified vote controls + standings — one flow, one panel. */
export function Leaderboard({ className }: { className?: string }) {
  const unranked = useRankForge((s) => s.unranked);
  const items = useRankForge((s) => s.items);
  const tiers = useRankForge((s) => s.tiers);
  const tierItems = useRankForge((s) => s.tierItems);
  const bankedScores = useRankForge((s) => s.bankedScores);
  const resetScores = useRankForge((s) => s.resetScores);
  const restoreScores = useRankForge((s) => s.restoreScores);
  const { members, status, isHost } = useMultiplayer();
  const { vote, startNextVote, endVote, cancelVote } = useVoting();
  const { votingMode, setVotingMode } = useVotingMode();

  const rows = React.useMemo(
    () => buildStandingsRows(bankedScores, tiers, tierItems, unranked),
    [bankedScores, tiers, tierItems, unranked]
  );
  const grouped = React.useMemo(
    () => groupStandingsByTierRow(rows, tiers),
    [rows, tiers]
  );
  const pending = React.useMemo(
    () => buildPendingVoteItems(items, unranked, bankedScores, members),
    [items, unranked, bankedScores, members]
  );

  const inRoom = status === "connected";
  const needsMorePlayers = inRoom && members.length < 2;
  const canManage = !inRoom || isHost;
  const hasStandings = rows.length > 0;
  const placedCount = rows.length;
  const totalCards = placedCount + unranked.length;

  const handleReset = () => {
    if (!hasStandings) return;
    const prev = { ...bankedScores };
    resetScores();
    toast.success("Standings cleared", {
      description: "Cards stay on the board — only the vote history was reset.",
      action: { label: "Undo", onClick: () => restoreScores(prev) },
      duration: 6000,
    });
  };

  if (!inRoom) {
    return (
      <div className={cn("space-y-3", className)}>
        <span className="rf-section-label">vote &amp; standings</span>
        <div className="rf-inset flex items-center gap-2 rounded-xl p-3 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          Join a live room to vote on cards and build standings together.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="rf-section-label">vote &amp; standings</span>
        {vote.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
            <span className="rf-live-dot size-1.5 rounded-full bg-violet-400" />
            voting
          </span>
        ) : hasStandings ? (
          <span className="text-[10px] font-medium text-muted-foreground">
            {placedCount}/{totalCards || placedCount} placed
          </span>
        ) : null}
      </div>

      <HowItWorks defaultOpen={!hasStandings && !vote.active} />

      {needsMorePlayers ? (
        <div className="rf-inset rounded-xl p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground/80">
            <Users className="size-3.5 shrink-0 text-violet-300" />
            Waiting for players
          </p>
          <p className="mt-1.5">Share the room link so others can vote with you.</p>
        </div>
      ) : (
        <>
          <LiveVoteStrip />

          {isHost ? (
            <div className="space-y-2">
              {vote.active ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={cancelVote}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" className="rf-btn-accent" onClick={endVote}>
                    <Zap className="size-3.5" /> End &amp; place
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="rf-btn-accent w-full"
                  onClick={startNextVote}
                  disabled={unranked.length === 0}
                >
                  <VoteIcon className="size-3.5" />
                  {unranked.length > 0
                    ? `Vote next · ${unranked.length} left in Unranked`
                    : "All cards placed"}
                </Button>
              )}

              <div className="rf-inset flex items-center justify-between gap-3 rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">Pick any card</p>
                  <p className="text-[11px] text-muted-foreground">
                    Vote buttons on cards in Unranked
                  </p>
                </div>
                <Switch
                  checked={votingMode}
                  onCheckedChange={setVotingMode}
                  aria-label="Toggle vote buttons on cards"
                />
              </div>
            </div>
          ) : vote.active ? (
            <p className="text-[11px] text-muted-foreground">
              Vote in the popup — standings update when the host ends the vote.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Waiting for the host to start the next vote.
            </p>
          )}
        </>
      )}

      {/* Standings list — same panel, updates as votes finish */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Standings
          </span>
          <Trophy className="size-3.5 text-amber-300/70" />
        </div>

        {pending.length > 0 ? (
          <div className="rf-inset rounded-xl p-2.5">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Up next ({pending.length})
            </p>
            <div className="space-y-1">
              {pending.slice(0, 5).map((item, i) => (
                <div
                  key={item.itemId}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-1 py-1",
                    i === 0 && !vote.active && "bg-violet-400/[0.06]"
                  )}
                >
                  <CardThumb label={item.label} imageUrl={item.imageUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {i === 0 && !vote.active ? "Next to vote" : "In Unranked"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {hasStandings ? (
          <div className="space-y-2">
            {grouped.map((group) => {
              let rank = 1;
              for (const g of grouped) {
                if (g.tierId === group.tierId) break;
                rank += g.rows.length;
              }
              const tierText = readableTextOn(group.tierColor);
              return (
                <div key={group.tierId} className="rf-inset rounded-xl p-2">
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span
                      className="grid min-w-[2rem] place-items-center rounded-md px-1.5 py-0.5 text-xs font-black uppercase"
                      style={{
                        backgroundColor: group.tierColor,
                        color: tierText,
                      }}
                    >
                      {group.tierName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {group.rows.length} card{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.rows.map((row, i) => (
                      <StandingsRowView key={row.itemId} row={row} rank={rank + i} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !needsMorePlayers ? (
          <div className="rf-inset rounded-xl p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80">No votes finished yet</p>
            <p className="mt-1.5">
              Start a vote — each completed vote adds a row here and moves the
              card on the board.
            </p>
          </div>
        ) : null}

        {canManage && hasStandings ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" />
            Clear standings
          </Button>
        ) : null}
      </div>
    </div>
  );
}
