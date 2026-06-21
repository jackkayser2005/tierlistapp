"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useMultiplayer } from "./use-multiplayer";
import {
  isPeerTierLetter,
  type PeerTierLetter,
} from "@/lib/peer-rating";
import {
  applyRatingPlacements,
  buildRatingTargets,
  type RatingTarget,
} from "@/lib/rating-targets";
import { resetSeq, shouldApplySeq } from "@/lib/room-seq";
import { toast } from "sonner";

export interface RatingState {
  active: boolean;
  submittedCount: number;
  totalPeers: number;
  hasSubmitted: boolean;
  targets: RatingTarget[];
}

export interface RatingRoundResult {
  itemId: string;
  tier: PeerTierLetter;
  hiddenAverage: number;
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
}

const EMPTY_RATING: RatingState = {
  active: false,
  submittedCount: 0,
  totalPeers: 0,
  hasSubmitted: false,
  targets: [],
};

interface PeerRatingContextValue {
  rating: RatingState;
  lastResults: RatingRoundResult[] | null;
  canControl: boolean;
  startRatingRound: () => void;
  submitBallot: (votes: Record<string, PeerTierLetter>) => void;
  endRatingRound: () => void;
  cancelRatingRound: () => void;
  clearLastResults: () => void;
}

const PeerRatingContext = React.createContext<PeerRatingContextValue>({
  rating: EMPTY_RATING,
  lastResults: null,
  canControl: false,
  startRatingRound: () => {},
  submitBallot: () => {},
  endRatingRound: () => {},
  cancelRatingRound: () => {},
  clearLastResults: () => {},
});

function normalizeTargets(raw: unknown): RatingTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: RatingTarget[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const t = entry as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id : "";
    const label = typeof t.label === "string" ? t.label : "";
    if (!id || !label) continue;
    out.push({
      id,
      label,
      ...(typeof t.imageUrl === "string" ? { imageUrl: t.imageUrl } : {}),
      ...(typeof t.linkedPlayerId === "string"
        ? { linkedPlayerId: t.linkedPlayerId }
        : {}),
      ...(typeof t.linkedPlayerName === "string"
        ? { linkedPlayerName: t.linkedPlayerName }
        : {}),
      ...(typeof t.linkedPlayerColor === "string"
        ? { linkedPlayerColor: t.linkedPlayerColor }
        : {}),
    });
  }
  return out;
}

function normalizeRatingState(
  raw: unknown,
  localIdentityId?: string,
): RatingState {
  if (!raw || typeof raw !== "object") return EMPTY_RATING;
  const p = raw as Record<string, unknown>;
  const submittedIdentityIds = Array.isArray(p.submittedIdentityIds)
    ? (p.submittedIdentityIds as unknown[]).filter(
        (id): id is string => typeof id === "string"
      )
    : [];
  const hasSubmitted = localIdentityId
    ? submittedIdentityIds.includes(localIdentityId)
    : !!p.hasSubmitted;
  return {
    active: !!p.active,
    submittedCount:
      typeof p.submittedCount === "number"
        ? p.submittedCount
        : submittedIdentityIds.length,
    totalPeers: typeof p.totalPeers === "number" ? p.totalPeers : 0,
    hasSubmitted,
    targets: normalizeTargets(p.targets),
  };
}

export function PeerRatingProvider({ children }: { children: React.ReactNode }) {
  const { roomId, isHost, status, members, user, logActivity, applySilentUpdate } =
    useMultiplayer();
  const bankRound = useRankForge((s) => s.bankRound);
  const moveItem = useRankForge((s) => s.moveItem);

  const [rating, setRating] = React.useState<RatingState>(EMPTY_RATING);
  const [lastResults, setLastResults] = React.useState<
    RatingRoundResult[] | null
  >(null);

  const isHostRef = React.useRef(isHost);
  const roomIdRef = React.useRef(roomId);
  const userIdRef = React.useRef(user.id);
  const ratingSeqRef = React.useRef(0);
  React.useEffect(() => {
    isHostRef.current = isHost;
    roomIdRef.current = roomId;
    userIdRef.current = user.id;
  }, [isHost, roomId, user.id]);

  React.useEffect(() => {
    if (status === "connected" && roomId) return;
    resetSeq(ratingSeqRef);
    setRating(EMPTY_RATING);
  }, [status, roomId]);

  React.useEffect(() => {
    const inRoom =
      !!roomId && (status === "connecting" || status === "connected");
    if (!inRoom) return;

    const sock = getSocket();
    if (!sock) return;

    const onState = (payload: unknown) => {
      if (!roomIdRef.current) return;
      const p = payload as Record<string, unknown>;
      if (!shouldApplySeq(ratingSeqRef, p.seq)) return;
      setRating(normalizeRatingState(payload, userIdRef.current));
    };

    const onResult = (payload: unknown) => {
      if (!roomIdRef.current) return;
      if (!payload || typeof payload !== "object") return;
      const p = payload as {
        results?: Record<
          string,
          {
            tier: string;
            hiddenAverage?: number;
            label: string;
            imageUrl?: string;
            linkedPlayerName?: string;
            linkedPlayerColor?: string;
          }
        >;
        placements?: { itemId: string; tier: string }[];
      };
      const raw = p.results ?? {};
      const placements = Array.isArray(p.placements) ? p.placements : [];

      const merged: RatingRoundResult[] = Object.entries(raw).map(
        ([itemId, row]) => ({
          itemId,
          tier: isPeerTierLetter(row.tier) ? row.tier : "D",
          hiddenAverage:
            typeof row.hiddenAverage === "number" ? row.hiddenAverage : 0,
          label: row.label,
          imageUrl: row.imageUrl,
          linkedPlayerName: row.linkedPlayerName,
          linkedPlayerColor: row.linkedPlayerColor,
        })
      );

      const applyPlacements = () => {
        const state = useRankForge.getState();
        const typed = placements
          .filter(
            (pl): pl is { itemId: string; tier: PeerTierLetter } =>
              typeof pl.itemId === "string" &&
              isPeerTierLetter(pl.tier)
          )
          .map((pl) => ({ itemId: pl.itemId, tier: pl.tier }));
        return applyRatingPlacements(
          state.tiers,
          state.unranked,
          typed,
          moveItem
        );
      };

      if (isHostRef.current) {
        const moved = applyPlacements();
        if (moved > 0) {
          logActivity("moved", `${moved} cards placed from ratings`);
        }
      } else {
        applySilentUpdate(applyPlacements);
      }

      setLastResults(merged);
      setRating(EMPTY_RATING);

      bankRound(
        merged.map((r) => ({
          id: r.itemId,
          tier: r.tier,
          hiddenAverage: r.hiddenAverage,
          label: r.label,
          imageUrl: r.imageUrl,
          linkedPlayerName: r.linkedPlayerName,
          linkedPlayerColor: r.linkedPlayerColor,
        }))
      );

      const top = [...merged].sort(
        (a, b) => "SABCD".indexOf(a.tier) - "SABCD".indexOf(b.tier)
      )[0];
      toast.success(
        top
          ? `Round complete — ${top.label} landed in ${top.tier}`
          : "Round complete",
        {
          description: "Cards moved to their tiers. Discuss and adjust from here.",
        }
      );
      logActivity("rating_ended", "Rating round");
    };

    const onError = (payload: { event?: string; message?: string }) => {
      if (payload?.event?.startsWith("rating")) {
        toast.error(payload.message ?? "Rating error");
      }
    };

    sock.on("rating:state", onState);
    sock.on("rating:result", onResult);
    sock.on("room:error", onError);

    if (status === "connected") {
      sock.emit("rating:sync-request", { roomId });
    }

    return () => {
      sock.off("rating:state", onState);
      sock.off("rating:result", onResult);
      sock.off("room:error", onError);
    };
  }, [status, roomId, bankRound, logActivity, moveItem, applySilentUpdate]);

  const startRatingRound = React.useCallback(() => {
    if (!roomIdRef.current) {
      toast.error("Join a room first");
      return;
    }
    if (!isHostRef.current) {
      toast.error("Only the host can start a rating round");
      return;
    }
    if (members.length < 2) {
      toast.error("Need at least 2 players in the room");
      return;
    }

    const state = useRankForge.getState();
    const targets = buildRatingTargets(state.items, state.unranked, members);
    if (targets.length === 0) {
      toast.error("Add cards to Unranked first", {
        description: "Link player photos to cards, then start the round.",
      });
      return;
    }

    const sock = getSocket();
    if (!sock?.connected) {
      toast.error("Not connected to the room server");
      return;
    }
    setLastResults(null);
    sock.emit("rating:start", { roomId: roomIdRef.current, targets });
    logActivity("rating_started", `${targets.length} cards up for rating`);
    toast("Rating round started", {
      description: "Rate each card — your votes stay private.",
    });
  }, [members, logActivity]);

  const submitBallot = React.useCallback(
    (votes: Record<string, PeerTierLetter>) => {
      if (!roomIdRef.current) return;
      const sock = getSocket();
      if (!sock?.connected) return;
      sock.emit("rating:submit", { roomId: roomIdRef.current, votes });
      setRating((prev) => ({ ...prev, hasSubmitted: true }));
      logActivity("rating_submitted", "Ballot submitted");
      toast.success("Ballot submitted", {
        description: "Waiting for everyone else…",
      });
    },
    [logActivity]
  );

  const endRatingRound = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) return;
    getSocket()?.emit("rating:end", { roomId: roomIdRef.current });
  }, []);

  const cancelRatingRound = React.useCallback(() => {
    if (!roomIdRef.current || !isHostRef.current) return;
    getSocket()?.emit("rating:cancel", { roomId: roomIdRef.current });
    setRating(EMPTY_RATING);
    logActivity("rating_cancelled", "Rating round cancelled");
    toast("Rating round cancelled");
  }, [logActivity]);

  const value = React.useMemo<PeerRatingContextValue>(
    () => ({
      rating,
      lastResults,
      canControl: status === "connected" && isHost,
      startRatingRound,
      submitBallot,
      endRatingRound,
      cancelRatingRound,
      clearLastResults: () => setLastResults(null),
    }),
    [
      rating,
      lastResults,
      status,
      isHost,
      startRatingRound,
      submitBallot,
      endRatingRound,
      cancelRatingRound,
    ]
  );

  return (
    <PeerRatingContext.Provider value={value}>
      {children}
    </PeerRatingContext.Provider>
  );
}

export function usePeerRating() {
  return React.useContext(PeerRatingContext);
}
