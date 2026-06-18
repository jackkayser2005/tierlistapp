"use client";

import * as React from "react";
import { Check, X, Trophy, Users, Vote as VoteIcon, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRankForge } from "@/lib/store";
import { readableTextOn, type TierItem } from "@/lib/tierlist";
import { useVoting } from "@/hooks/use-voting";
import { toast } from "sonner";

function VoteCard({ item }: { item: TierItem }) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = item.type === "image" && item.imageUrl && !imgError;
  return (
    <div className="rf-pop-in relative size-40 overflow-hidden rounded-2xl border border-white/15 shadow-2xl sm:size-48">
      {showImage ? (
        <>
          <img
            src={item.imageUrl}
            alt={item.label}
            onError={() => setImgError(true)}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10">
            <p className="text-center text-sm font-bold text-white drop-shadow">
              {item.label}
            </p>
          </div>
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-lg font-black text-foreground/80">
            {item.label.charAt(0).toUpperCase()}
          </span>
          <span className="text-center text-sm font-bold text-foreground/90">
            {item.label}
          </span>
        </div>
      )}
    </div>
  );
}

/** Winner celebration shown briefly after a vote ends. */
function CelebrationOverlay() {
  const { celebration, dismissCelebration } = useVoting();
  const tiers = useRankForge((s) => s.tiers);
  if (!celebration) return null;

  const winnerTier = tiers.find((t) => t.id === celebration.winnerTierId);
  const winnerColor = winnerTier?.color ?? "#8b5cf6";
  const textColor = readableTextOn(winnerColor);
  const totalVotes = Object.values(celebration.tally).reduce((a, b) => a + b, 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={dismissCelebration}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-lg" />
      <div
        className="rf-pop-in relative w-full max-w-md overflow-hidden rounded-3xl p-8 text-center"
        style={{
          background: `linear-gradient(160deg, ${winnerColor}, color-mix(in srgb, ${winnerColor} 50%, #000))`,
          color: textColor,
        }}
      >
        {/* sparkle decorations */}
        <div className="pointer-events-none absolute inset-0 opacity-30">
          {Array.from({ length: 8 }).map((_, i) => (
            <Sparkles
              key={i}
              className="absolute size-4 animate-pulse"
              style={{
                left: `${10 + (i * 11) % 80}%`,
                top: `${15 + (i * 23) % 70}%`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>

        <div className="relative">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
            <Trophy className="size-8" style={{ color: textColor }} />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">
            Winner
          </p>
          <p className="mt-1 text-5xl font-black tracking-tight">
            {celebration.winnerTierName}
          </p>
          <p className="mt-3 text-lg font-bold opacity-90">
            {celebration.itemName}
          </p>
          <p className="mt-1 text-xs opacity-70">
            {totalVotes} vote{totalVotes === 1 ? "" : "s"} cast
          </p>

          {/* mini tally bars */}
          <div className="mt-5 space-y-1.5">
            {Object.entries(celebration.tally)
              .sort((a, b) => b[1] - a[1])
              .map(([tierId, count]) => {
                const t = tiers.find((x) => x.id === tierId);
                const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const isWinner = tierId === celebration.winnerTierId;
                return (
                  <div key={tierId} className="flex items-center gap-2">
                    <span className="w-6 text-xs font-bold opacity-80">
                      {t?.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/20">
                      <div
                        className="h-full rounded-full bg-white/70 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-4 text-xs font-bold opacity-80">{count}</span>
                    {isWinner ? (
                      <Trophy className="size-3 opacity-90" />
                    ) : null}
                  </div>
                );
              })}
          </div>

          <p className="mt-5 text-[11px] opacity-60">
            Tap anywhere to dismiss
          </p>
        </div>
      </div>
    </div>
  );
}

export function VotingOverlay() {
  const tiers = useRankForge((s) => s.tiers);
  const { vote, myVote, castVote, endVote, cancelVote, canControl } =
    useVoting();

  if (!vote.active || !vote.item) return <CelebrationOverlay />;

  const totalVotes = vote.voterCount;
  const leadingTierId = Object.entries(vote.tally).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];
  const maxCount = Math.max(1, ...Object.values(vote.tally));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

        {/* card */}
        <div className="rf-pop-in rf-panel relative w-full max-w-lg overflow-hidden rounded-3xl p-6 sm:p-8">
          {/* header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rf-brand rf-glow grid size-8 place-items-center rounded-lg">
                <VoteIcon className="size-4 text-white" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">
                  Vote now!
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {totalVotes} of {vote.totalPeers} voted
                </p>
              </div>
            </div>
            {canControl ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={cancelVote}
                >
                  <X className="size-4" /> Cancel
                </Button>
                <Button size="sm" className="rf-btn-accent" onClick={endVote}>
                  <Zap className="size-4" /> End &amp; place
                </Button>
              </div>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-muted-foreground">
                Cast your vote!
              </span>
            )}
          </div>

          {/* the item being voted on */}
          <div className="flex flex-col items-center gap-3">
            <VoteCard item={vote.item} />
            <p className="text-center text-xs text-muted-foreground">
              Where does this belong? Pick a tier.
            </p>
          </div>

          {/* tier vote buttons with animated bars */}
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {tiers.map((tier) => {
              const count = vote.tally[tier.id] ?? 0;
              const isMyVote = myVote === tier.id;
              const isLeading = leadingTierId === tier.id && count > 0;
              const textColor = readableTextOn(tier.color);
              const barHeight = (count / maxCount) * 100;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => castVote(tier.id)}
                  className={cn(
                    "group relative flex h-24 flex-col items-center justify-end gap-1 overflow-hidden rounded-xl border p-2.5 transition-all",
                    "active:scale-95",
                    isMyVote
                      ? "border-white/50 ring-2 ring-white/40"
                      : "border-white/10 hover:border-white/30 hover:-translate-y-0.5"
                  )}
                  style={{
                    background: `linear-gradient(160deg, ${tier.color}, color-mix(in srgb, ${tier.color} 50%, #000))`,
                    color: textColor,
                  }}
                >
                  {/* animated vote bar fill from bottom */}
                  <div
                    className="absolute inset-x-0 bottom-0 bg-white/15 transition-all duration-500 ease-out"
                    style={{ height: `${barHeight}%` }}
                  />
                  <span className="relative text-xl font-black uppercase tracking-tight">
                    {tier.name}
                  </span>
                  <span
                    className="relative flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm"
                    style={{ color: textColor }}
                  >
                    {count > 0 ? (
                      <>
                        {isLeading ? <Trophy className="size-3" /> : null}
                        {count}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  {isMyVote ? (
                    <span className="relative grid size-5 place-items-center rounded-full bg-white/90 text-black">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* progress bar */}
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="rf-brand h-full rounded-full transition-all duration-300"
                style={{
                  width: `${
                    vote.totalPeers > 0
                      ? (totalVotes / vote.totalPeers) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {myVote
                ? "✓ You voted — waiting on the others."
                : "Pick a tier to cast your vote."}
            </p>
          </div>
        </div>
      </div>
      <CelebrationOverlay />
    </>
  );
}

/**
 * A small "Vote" button rendered on each unranked card when voting mode is on
 * and the user is the host. Clicking starts a vote round for that item.
 */
export function VoteButton({
  item,
  votingMode,
}: {
  item: TierItem;
  votingMode: boolean;
}) {
  const { startVote } = useVoting();
  if (!votingMode) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      className="rf-no-export absolute inset-x-1.5 bottom-1.5 h-6 gap-1 rounded-md border border-white/10 bg-background/90 text-[10px] font-semibold opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        startVote(item);
        toast("Vote started — everyone can now vote", {
          description: item.label,
        });
      }}
    >
      <VoteIcon className="size-3" /> Vote
    </Button>
  );
}
