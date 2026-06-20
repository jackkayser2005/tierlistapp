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
  /** socket ids of members who have already cast a vote. */
  voters: string[];
}

interface VoteResult {
  itemId: string;
  tally: VoteTally;
  winner: string | null;
}

/** Winner celebration shown briefly after a vote ends. */
export interface Celebration {
  itemId: string;
  itemName: string;
  winnerTierId: string;
  winnerTierName: string;
  tally: VoteTally;
  ts: number;
}

const EMPTY_VOTE: VoteState = {
  active: false,
  itemId: null,
  item: null,
  tally: {},
  voterCount: 0,
  totalPeers: 0,
  voters: [],
};

interface VotingContextValue {
  vote: VoteState;
  myVote: string | null;
  celebration: Celebration | null;
  canControl: boolean;
  startVote: (item: TierItem) => void;
  startNextVote: () => void;
  castVote: (tierId: string) => void;
  endVote: () => void;
  cancelVote: () => void;
  dismissCelebration: () => void;
}

const VotingContext = React.createContext<VotingContextValue>({
  vote: EMPTY_VOTE,
  myVote: null,
  celebration: null,
  canControl: false,
  startVote: () => {},
  startNextVote: () => {},
  castVote: () => {},
  endVote: () => {},
  cancelVote: () => {},
  dismissCelebration: () => {},
});

export function VotingProvider({ children }: { children: React.ReactNode }) {
  const { status, roomId, isHost, logActivity, setPresence } = useMultiplayer();
  const [vote, setVote] = React.useState<VoteState>(EMPTY_VOTE);
  const [myVote, setMyVote] = React.useState<string | null>(null);
  const [celebration, setCelebration] = React.useState<Celebration | null>(null);

  // Refs to avoid stale closures inside socket listeners.
  const isHostRef = React.useRef(isHost);
  const roomIdRef = React.useRef(roomId);
  const votedItemRef = React.useRef<string | null>(null);
  const celebrationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Subscribe to store values via refs so listeners don't re-bind on every change.
  const store = useRankForge;
  const moveItem = React.useCallback((id: string, from: string, to: string) => {
    store.getState().moveItem(id, from, to, -1);
  }, []);

  const dismissCelebration = React.useCallback(() => {
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    setCelebration(null);
  }, []);

  // ---- Single set of socket listeners, bound once per connection ----
  React.useEffect(() => {
    if (status !== "connected") {
      setVote(EMPTY_VOTE);
      setMyVote(null);
      votedItemRef.current = null;
      return;
    }
    const sock = getSocket();
    if (!sock) return;

    // Request current vote state on connect.
    if (roomIdRef.current) {
      sock.emit("vote:sync-request", { roomId: roomIdRef.current });
    }

    const onState = (payload: VoteState) => {
      if (!payload || !payload.active) {
        setVote(EMPTY_VOTE);
        setMyVote(null);
        votedItemRef.current = null;
        setPresence("online");
        return;
      }
      setVote(payload);
      setPresence("voting");
      if (votedItemRef.current !== payload.itemId) {
        votedItemRef.current = payload.itemId;
        setMyVote(null);
      }
    };

    const onResult = (payload: VoteResult) => {
      setVote(EMPTY_VOTE);
      setMyVote(null);
      votedItemRef.current = null;
      setPresence("online");

      const s = store.getState();
      const winnerTier = s.tiers.find((t) => t.id === payload.winner);
      const itemName = s.items[payload.itemId]?.label ?? "Item";

      // Host applies placement (single board sync).
      if (isHostRef.current && payload.winner) {
        const fromContainer = s.findContainerOf(payload.itemId);
        if (fromContainer && fromContainer !== payload.winner) {
          moveItem(payload.itemId, fromContainer, payload.winner);
          toast.success(`"${itemName}" → ${winnerTier?.name ?? "tier"}`, {
            description: summarizeTally(payload.tally, s.tiers),
          });
          logActivity("vote_ended", `${itemName} → ${winnerTier?.name ?? "tier"}`);
        }
      }

      // Show a winner celebration for everyone.
      if (payload.winner) {
        setCelebration({
          itemId: payload.itemId,
          itemName,
          winnerTierId: payload.winner,
          winnerTierName: winnerTier?.name ?? "tier",
          tally: payload.tally,
          ts: Date.now(),
        });
        if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = setTimeout(() => {
          setCelebration(null);
          celebrationTimerRef.current = null;
        }, 2800);
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
    // Bind only to `status` and `roomId` — everything else uses refs.
  }, [status, roomId]);

  // ---- Actions ----
  const startVote = React.useCallback(
    (item: TierItem) => {
      if (!roomIdRef.current || !isHostRef.current) {
        toast.error("Only the host can start a vote");
        return;
      }
      const sock = getSocket();
      sock?.emit("vote:start", { roomId: roomIdRef.current, itemId: item.id, item });
      logActivity("vote_started", item.label);
    },
    [logActivity]
  );

  // Host helper: start a vote on the next item still sitting in Unranked.
  const startNextVote = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) {
      toast.error("Only the host can start a vote");
      return;
    }
    const s = store.getState();
    const nextId = s.unranked[0];
    const item = nextId ? s.items[nextId] : null;
    if (!item) {
      toast("Nothing left to vote on", {
        description: "The Unranked pool is empty.",
      });
      return;
    }
    startVote(item);
    toast("Vote started", { description: item.label });
  }, [startVote]);

  const castVote = React.useCallback(
    (tierId: string) => {
      if (!roomIdRef.current) return;
      // Read current vote state from a ref to avoid stale closures.
      setVote((current) => {
        if (!current.active || !current.itemId) return current;
        votedItemRef.current = current.itemId;
        const sock = getSocket();
        sock?.emit("vote:cast", {
          roomId: roomIdRef.current,
          itemId: current.itemId,
          tierId,
        });
        const s = store.getState();
        const tierName = s.tiers.find((t) => t.id === tierId)?.name ?? tierId;
        const itemName = current.item?.label ?? "item";
        logActivity("voted", `${tierName} for ${itemName}`);
        return current;
      });
      setMyVote(tierId);
    },
    [logActivity]
  );

  const endVote = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) {
      toast.error("Only the host can end the vote");
      return;
    }
    const sock = getSocket();
    sock?.emit("vote:end", { roomId: roomIdRef.current });
  }, []);

  const cancelVote = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) return;
    const sock = getSocket();
    sock?.emit("vote:cancel", { roomId: roomIdRef.current });
    logActivity("vote_cancelled", "");
  }, [logActivity]);

  const value = React.useMemo<VotingContextValue>(
    () => ({
      vote,
      myVote,
      celebration,
      canControl: isHost,
      startVote,
      startNextVote,
      castVote,
      endVote,
      cancelVote,
      dismissCelebration,
    }),
    [vote, myVote, celebration, isHost, startVote, startNextVote, castVote, endVote, cancelVote, dismissCelebration]
  );

  return (
    <VotingContext.Provider value={value}>{children}</VotingContext.Provider>
  );
}

/** Consume shared voting state. Must be used inside VotingProvider. */
export function useVoting() {
  return React.useContext(VotingContext);
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
