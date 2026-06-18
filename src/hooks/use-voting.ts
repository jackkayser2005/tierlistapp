"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useMultiplayer } from "./use-multiplayer";
import type { TierItem } from "@/lib/tierlist";
import { toast } from "sonner";

export interface VoteTally {
  [tierId: string]: number;
}

export interface VoteState {
  active: boolean;
  itemId: string | null;
  item: TierItem | null;
  tally: VoteTally;
  voterCount: number;
  totalPeers: number;
}

interface VoteResult {
  itemId: string;
  tally: VoteTally;
  winner: string | null;
}

const EMPTY_VOTE: VoteState = {
  active: false,
  itemId: null,
  item: null,
  tally: {},
  voterCount: 0,
  totalPeers: 0,
};

/**
 * Drives the voting flow. Listens to vote:state / vote:result on the shared
 * socket and exposes start/cast/end/cancel actions. Only the host may start,
 * end, or cancel; any peer may cast a vote.
 *
 * On vote:result (host only), the winning item is moved into the winning tier
 * via the board store, which then syncs to everyone through normal board sync.
 */
export function useVoting() {
  const { status, roomId, isHost } = useMultiplayer();
  const [vote, setVote] = React.useState<VoteState>(EMPTY_VOTE);
  const [myVote, setMyVote] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<VoteResult | null>(null);

  const moveItem = useRankForge((s) => s.moveItem);
  const findContainerOf = useRankForge((s) => s.findContainerOf);
  const tiers = useRankForge((s) => s.tiers);
  const items = useRankForge((s) => s.items);
  // Track the item we currently have a vote recorded for, so we can keep
  // myVote across tally updates but reset when the voted-on item changes.
  const votedItemRef = React.useRef<string | null>(null);

  // ---- Attach socket listeners whenever connected ----
  React.useEffect(() => {
    if (status !== "connected") {
      setVote(EMPTY_VOTE);
      setMyVote(null);
      votedItemRef.current = null;
      return;
    }
    const sock = getSocket();
    if (!sock) return;

    // Request the current vote state in case a vote is already in progress.
    if (roomId) {
      sock.emit("vote:sync-request", { roomId });
    }

    const onState = (payload: VoteState) => {
      if (!payload || !payload.active) {
        setVote(EMPTY_VOTE);
        setMyVote(null);
        votedItemRef.current = null;
        return;
      }
      setVote(payload);
      // If the item being voted on changed, forget our local vote choice.
      if (votedItemRef.current !== payload.itemId) {
        votedItemRef.current = payload.itemId;
        setMyVote(null);
      }
    };

    const onResult = (payload: VoteResult) => {
      setLastResult(payload);
      setVote(EMPTY_VOTE);
      setMyVote(null);
      votedItemRef.current = null;

      // Only the host applies the placement, so the board change syncs once.
      if (isHost && payload.winner) {
        const itemId = payload.itemId;
        const fromContainer = findContainerOf(itemId);
        if (fromContainer && fromContainer !== payload.winner) {
          moveItem(itemId, fromContainer, payload.winner, -1);
          const winnerTier = tiers.find((t) => t.id === payload.winner);
          const itemName = items[itemId]?.label ?? "Item";
          toast.success(`“${itemName}” → ${winnerTier?.name ?? "tier"}`, {
            description: summarizeTally(payload.tally, tiers),
          });
        }
      }
    };

    const onError = (payload: { event?: string; message?: string }) => {
      if (payload?.event?.startsWith("vote")) {
        toast.error(payload.message ?? "Voting error");
      }
    };

    sock.on("vote:state", onState);
    sock.on("vote:result", onResult);
    sock.on("room:error", onError);

    return () => {
      sock.off("vote:state", onState);
      sock.off("vote:result", onResult);
      sock.off("room:error", onError);
    };
  }, [status, roomId, isHost, findContainerOf, moveItem, tiers, items]);

  // ---- Actions ----
  const startVote = React.useCallback(
    (item: TierItem) => {
      if (!roomId || !isHost) {
        toast.error("Only the host can start a vote");
        return;
      }
      const sock = getSocket();
      sock?.emit("vote:start", { roomId, itemId: item.id, item });
    },
    [roomId, isHost]
  );

  const castVote = React.useCallback(
    (tierId: string) => {
      if (!roomId || !vote.active || !vote.itemId) return;
      votedItemRef.current = vote.itemId;
      setMyVote(tierId);
      const sock = getSocket();
      sock?.emit("vote:cast", { roomId, itemId: vote.itemId, tierId });
    },
    [roomId, vote.active, vote.itemId]
  );

  const endVote = React.useCallback(() => {
    if (!roomId || !isHost) {
      toast.error("Only the host can end the vote");
      return;
    }
    const sock = getSocket();
    sock?.emit("vote:end", { roomId });
  }, [roomId, isHost]);

  const cancelVote = React.useCallback(() => {
    if (!roomId || !isHost) return;
    const sock = getSocket();
    sock?.emit("vote:cancel", { roomId });
  }, [roomId, isHost]);

  return {
    vote,
    myVote,
    lastResult,
    canControl: isHost,
    startVote,
    castVote,
    endVote,
    cancelVote,
  };
}

function summarizeTally(
  tally: VoteTally,
  tiers: { id: string; name: string }[]
): string {
  const parts = Object.entries(tally)
    .map(([tierId, count]) => {
      const t = tiers.find((x) => x.id === tierId);
      return `${t?.name ?? tierId}: ${count}`;
    })
    .join("  ·  ");
  return parts || "No votes cast";
}
