"use client";

import * as React from "react";
import { Check, X, Trophy, Users, Vote as VoteIcon } from "lucide-react";
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

export function VotingOverlay() {
  const tiers = useRankForge((s) => s.tiers);
  const { vote, myVote, castVote, endVote, cancelVote, canControl } =
    useVoting();

  if (!vote.active || !vote.item) return null;

  const totalVotes = vote.voterCount;
  const leadingTierId = Object.entries(vote.tally).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* card */}
      <div className="rf-pop-in rf-panel relative w-full max-w-lg overflow-hidden rounded-3xl p-6 sm:p-8">
        {/* header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rf-brand grid size-8 place-items-center rounded-lg">
              <VoteIcon className="size-4 text-white" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Voting in progress
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
              <Button size="sm" className="rf-accent text-black hover:opacity-90" onClick={endVote}>
                <Trophy className="size-4" /> End &amp; place
              </Button>
            </div>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-muted-foreground">
              Waiting for votes…
            </span>
          )}
        </div>

        {/* the item being voted on */}
        <div className="flex flex-col items-center gap-4">
          <VoteCard item={vote.item} />
          <p className="text-center text-xs text-muted-foreground">
            Where does this belong? Cast your vote.
          </p>
        </div>

        {/* tier vote buttons */}
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {tiers.map((tier) => {
            const count = vote.tally[tier.id] ?? 0;
            const isMyVote = myVote === tier.id;
            const isLeading = leadingTierId === tier.id && count > 0;
            const textColor = readableTextOn(tier.color);
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => castVote(tier.id)}
                className={cn(
                  "group relative flex flex-col items-center gap-1 overflow-hidden rounded-xl border p-3 transition-all",
                  "active:scale-95",
                  isMyVote
                    ? "border-white/40 ring-2 ring-white/30"
                    : "border-white/10 hover:border-white/25 hover:-translate-y-0.5"
                )}
                style={{
                  background: `linear-gradient(160deg, ${tier.color}, color-mix(in srgb, ${tier.color} 55%, #000))`,
                  color: textColor,
                }}
              >
                <span className="text-2xl font-black uppercase tracking-tight">
                  {tier.name}
                </span>
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm"
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    color: textColor,
                  }}
                >
                  {count > 0 ? (
                    <>
                      {isLeading ? (
                        <Trophy className="size-3" />
                      ) : null}
                      {count}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                {isMyVote ? (
                  <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white/90 text-black">
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
              ? "You voted — waiting on the others."
              : "Pick a tier to cast your vote."}
          </p>
        </div>
      </div>
    </div>
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
