"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useMultiplayer } from "./use-multiplayer";
import { memberKey } from "@/lib/presence";
import type { TierItem } from "@/lib/tierlist";
import { resetSeq, shouldApplySeq } from "@/lib/room-seq";
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
  voters: string[];
}

interface VoteResult {
  itemId: string;
  tally: VoteTally;
  winner: string | null;
}

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

/** Normalize a server vote:state payload into a typed client VoteState. */
function normalizeVoteState(
  raw: unknown,
  previous: VoteState = EMPTY_VOTE,
): VoteState {
  if (!raw || typeof raw !== "object") return EMPTY_VOTE;
  const p = raw as Record<string, unknown>;
  if (!p.active) return EMPTY_VOTE;

  const itemId = typeof p.itemId === "string" ? p.itemId : null;
  const itemRaw = p.item;
  let item: TierItem | null = null;
  if (itemRaw && typeof itemRaw === "object" && !Array.isArray(itemRaw)) {
    const it = itemRaw as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id : String(itemId ?? "");
    const label = typeof it.label === "string" ? it.label : "Item";
    item = {
      id,
      type: it.type === "image" ? "image" : "text",
      label,
      ...(typeof it.imageUrl === "string" ? { imageUrl: it.imageUrl } : {}),
    };
  } else if (
    itemId &&
    previous.itemId === itemId &&
    previous.item
  ) {
    // Tally-only relay from vote:cast — reuse cached item.
    item = previous.item;
  }

  const tally: VoteTally = {};
  if (p.tally && typeof p.tally === "object") {
    for (const [k, v] of Object.entries(p.tally as Record<string, unknown>)) {
      if (typeof v === "number") tally[k] = v;
    }
  }

  return {
    active: true,
    itemId,
    item,
    tally,
    voterCount: typeof p.voterCount === "number" ? p.voterCount : 0,
    totalPeers: typeof p.totalPeers === "number" ? p.totalPeers : 0,
    voters: Array.isArray(p.voters)
      ? (p.voters as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
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

export function VotingProvider({ children }: { children: React.ReactNode }) {
  const { status, roomId, isHost, members, logActivity, setPresence, applySilentUpdate } =
    useMultiplayer();
  const recordVote = useRankForge((s) => s.recordVote);
  const [vote, setVote] = React.useState<VoteState>(EMPTY_VOTE);
  const [myVote, setMyVote] = React.useState<string | null>(null);
  const [celebration, setCelebration] = React.useState<Celebration | null>(null);

  const isHostRef = React.useRef(isHost);
  const roomIdRef = React.useRef(roomId);
  const myVoteRef = React.useRef<string | null>(null);
  const activeItemRef = React.useRef<string | null>(null);
  const voteRef = React.useRef(vote);
  voteRef.current = vote;
  const celebrationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const voteSeqRef = React.useRef(0);

  React.useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  React.useEffect(() => {
    myVoteRef.current = myVote;
  }, [myVote]);

  // Reset local vote UI when leaving a room.
  React.useEffect(() => {
    if (status === "connected" && roomId) return;
    resetSeq(voteSeqRef);
    setVote(EMPTY_VOTE);
    setMyVote(null);
    myVoteRef.current = null;
    activeItemRef.current = null;
  }, [status, roomId]);

  const dismissCelebration = React.useCallback(() => {
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    setCelebration(null);
  }, []);

  const placeWinner = React.useCallback(
    (itemId: string, winnerTierId: string) => {
      const s = useRankForge.getState();
      const fromContainer = s.findContainerOf(itemId);
      if (!fromContainer || fromContainer === winnerTierId) return;

      const apply = () => {
        s.moveItem(itemId, fromContainer, winnerTierId, -1);
      };

      if (isHostRef.current) {
        apply();
      } else {
        applySilentUpdate(apply);
      }
    },
    [applySilentUpdate]
  );

  // ---- Socket listeners: attach while connecting so room:join hydration
  // cannot arrive before handlers are registered. Sync once connected.
  React.useEffect(() => {
    const inRoom =
      !!roomId && (status === "connecting" || status === "connected");
    if (!inRoom) return;

    const sock = getSocket();
    if (!sock) return;

    const onState = (payload: unknown) => {
      if (!roomIdRef.current) return;
      const p = payload as Record<string, unknown>;
      if (!shouldApplySeq(voteSeqRef, p.seq)) return;

      const next = normalizeVoteState(payload, voteRef.current);
      if (!next.active) {
        setVote(EMPTY_VOTE);
        setMyVote(null);
        myVoteRef.current = null;
        activeItemRef.current = null;
        setPresence("online");
        return;
      }

      setVote(next);
      setPresence("voting");

      if (activeItemRef.current !== next.itemId) {
        activeItemRef.current = next.itemId;
        setMyVote(null);
        myVoteRef.current = null;
      }
    };

    const onResult = (payload: VoteResult) => {
      if (!roomIdRef.current) return;
      setVote(EMPTY_VOTE);
      setMyVote(null);
      myVoteRef.current = null;
      activeItemRef.current = null;
      setPresence("online");

      const s = useRankForge.getState();
      const winnerTier = s.tiers.find((t) => t.id === payload.winner);
      const itemName = s.items[payload.itemId]?.label ?? "Item";

      if (payload.winner) {
        placeWinner(payload.itemId, payload.winner);

        const item = s.items[payload.itemId];
        const winnerTier = s.tiers.find((t) => t.id === payload.winner);
        if (item && winnerTier) {
          let linkedPlayerName: string | undefined;
          let linkedPlayerColor: string | undefined;
          if (item.assignedUserId) {
            const linked = members.find(
              (m) =>
                memberKey(m) === item.assignedUserId ||
                m.id === item.assignedUserId
            );
            linkedPlayerName = linked?.name;
            linkedPlayerColor = linked?.color;
          }
          recordVote([
            {
              id: payload.itemId,
              label: item.label,
              tierId: winnerTier.id,
              tierName: winnerTier.name,
              tierColor: winnerTier.color,
              voteCount: payload.tally[payload.winner] ?? 0,
              ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
              ...(linkedPlayerName ? { linkedPlayerName } : {}),
              ...(linkedPlayerColor ? { linkedPlayerColor } : {}),
            },
          ]);
        }

        if (isHostRef.current) {
          toast.success(`"${itemName}" → ${winnerTier?.name ?? "tier"}`, {
            description: summarizeTally(payload.tally, s.tiers),
          });
          logActivity("vote_ended", `${itemName} → ${winnerTier?.name ?? "tier"}`);
        }

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
      } else if (isHostRef.current) {
        toast("Vote ended with no votes", { description: itemName });
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

    if (status === "connected") {
      sock.emit("vote:sync-request", { roomId });
    }

    return () => {
      sock.off("vote:state", onState);
      sock.off("vote:result", onResult);
      sock.off("room:error", onError);
    };
  }, [status, roomId, setPresence, logActivity, placeWinner, recordVote, members]);

  const startVote = React.useCallback(
    (item: TierItem) => {
      if (!roomIdRef.current) {
        toast.error("Join a room first");
        return;
      }
      if (!isHostRef.current) {
        toast.error("Only the host can start a vote");
        return;
      }
      const sock = getSocket();
      if (!sock?.connected) {
        toast.error("Not connected to the room server");
        return;
      }
      sock.emit("vote:start", {
        roomId: roomIdRef.current,
        itemId: item.id,
        item: {
          id: item.id,
          type: item.type,
          label: item.label,
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        },
      });

      // Optimistically show the overlay for the host immediately — the server
      // echo (vote:state) reconciles tallies a few ms later. This makes the
      // window pop instantly and removes any dependency on the round-trip.
      activeItemRef.current = item.id;
      setMyVote(null);
      myVoteRef.current = null;
      setVote({
        active: true,
        itemId: item.id,
        item,
        tally: {},
        voterCount: 0,
        totalPeers: 0,
        voters: [],
      });

      logActivity("vote_started", item.label);
    },
    [logActivity]
  );

  const startNextVote = React.useCallback(() => {
    if (!isHostRef.current) {
      toast.error("Only the host can start a vote");
      return;
    }
    const s = useRankForge.getState();
    const nextId = s.unranked[0];
    const item = nextId ? s.items[nextId] : null;
    if (!item) {
      toast("Nothing left to vote on", {
        description: "Add items to Unranked first.",
      });
      return;
    }
    startVote(item);
  }, [startVote]);

  const castVote = React.useCallback(
    (tierId: string) => {
      const rid = roomIdRef.current;
      if (!rid) return;

      const current =
        activeItemRef.current ?? voteRef.current.itemId ?? null;
      if (!current || !voteRef.current.active) return;

      const sock = getSocket();
      if (!sock?.connected) {
        toast.error("Lost connection — reconnecting…");
        return;
      }

      sock.emit("vote:cast", {
        roomId: rid,
        itemId: current,
        tierId,
      });

      activeItemRef.current = current;
      setMyVote(tierId);
      myVoteRef.current = tierId;

      const s = useRankForge.getState();
      const tierName = s.tiers.find((t) => t.id === tierId)?.name ?? tierId;
      const itemName = s.items[current]?.label ?? "item";
      logActivity("voted", `${tierName} for ${itemName}`);
    },
    [logActivity]
  );

  const endVote = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) {
      toast.error("Only the host can end the vote");
      return;
    }
    getSocket()?.emit("vote:end", { roomId: roomIdRef.current });
  }, []);

  const cancelVote = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) return;
    getSocket()?.emit("vote:cancel", { roomId: roomIdRef.current });
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
    [
      vote,
      myVote,
      celebration,
      isHost,
      startVote,
      startNextVote,
      castVote,
      endVote,
      cancelVote,
      dismissCelebration,
    ]
  );

  return (
    <VotingContext.Provider value={value}>{children}</VotingContext.Provider>
  );
}

export function useVoting() {
  return React.useContext(VotingContext);
}
