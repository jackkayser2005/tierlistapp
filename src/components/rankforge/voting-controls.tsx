"use client";

import * as React from "react";
import { Vote as VoteIcon, Zap, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { useVoting } from "@/hooks/use-voting";
import { useRankForge } from "@/lib/store";
import { useVotingMode } from "./voting-context";

export function VotingControls() {
  const { status, isHost } = useMultiplayer();
  const { vote, startNextVote, endVote, cancelVote } = useVoting();
  const { votingMode, setVotingMode } = useVotingMode();
  const unranked = useRankForge((s) => s.unranked);

  if (status !== "connected") {
    return (
      <div className="space-y-3">
        <span className="rf-section-label">voting</span>
        <div className="rf-inset flex items-center gap-2 rounded-xl p-3 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          Start or join a live room to enable voting.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rf-section-label">voting</span>
        {vote.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
            <span className="rf-live-dot size-1.5 rounded-full bg-violet-400" />
            live
          </span>
        ) : null}
      </div>

      {/* Voting mode toggle */}
      <div className="rf-inset flex items-center justify-between gap-3 rounded-xl p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Voting mode</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Show a Vote button on every card.
          </p>
        </div>
        <Switch
          checked={votingMode}
          onCheckedChange={setVotingMode}
          aria-label="Toggle voting mode"
        />
      </div>

      {/* Host controls */}
      {isHost ? (
        vote.active ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={cancelVote}
            >
              Cancel vote
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
              ? `Vote on next item (${unranked.length})`
              : "Unranked is empty"}
          </Button>
        )
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {vote.active
            ? "A vote is in progress — cast your vote on the popup."
            : "Only the host can start a vote. You'll be able to cast yours."}
        </p>
      )}

      {votingMode ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          Hover any card and tap{" "}
          <span className="font-semibold text-foreground/70">Vote</span> to put
          it up for a group vote.
        </p>
      ) : null}
    </div>
  );
}
