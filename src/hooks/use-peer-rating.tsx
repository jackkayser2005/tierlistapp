"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { getSocket } from "@/lib/socket";
import { useMultiplayer } from "./use-multiplayer";
import {
  isPeerTierLetter,
  type PeerTierLetter,
} from "@/lib/peer-rating";
import { toast } from "sonner";

export interface RatingState {
  active: boolean;
  submittedCount: number;
  totalPeers: number;
  hasSubmitted: boolean;
}

export interface RatingRoundResult {
  identityId: string;
  tier: PeerTierLetter;
  hiddenAverage: number;
  name: string;
  color: string;
}

const EMPTY_RATING: RatingState = {
  active: false,
  submittedCount: 0,
  totalPeers: 0,
  hasSubmitted: false,
};

interface PeerRatingContextValue {
  rating: RatingState;
  /** Latest finished round (before banked) — tiers only in UI. */
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

function normalizeRatingState(raw: unknown): RatingState {
  if (!raw || typeof raw !== "object") return EMPTY_RATING;
  const p = raw as Record<string, unknown>;
  return {
    active: !!p.active,
    submittedCount:
      typeof p.submittedCount === "number" ? p.submittedCount : 0,
    totalPeers: typeof p.totalPeers === "number" ? p.totalPeers : 0,
    hasSubmitted: !!p.hasSubmitted,
  };
}

export function PeerRatingProvider({ children }: { children: React.ReactNode }) {
  const { roomId, isHost, status, members, logActivity } =
    useMultiplayer();
  const bankRound = useRankForge((s) => s.bankRound);

  const [rating, setRating] = React.useState<RatingState>(EMPTY_RATING);
  const [lastResults, setLastResults] = React.useState<
    RatingRoundResult[] | null
  >(null);

  const isHostRef = React.useRef(isHost);
  const roomIdRef = React.useRef(roomId);
  React.useEffect(() => {
    isHostRef.current = isHost;
    roomIdRef.current = roomId;
  }, [isHost, roomId]);

  React.useEffect(() => {
    if (status !== "connected" || !roomId) {
      setRating(EMPTY_RATING);
      return;
    }

    const sock = getSocket();
    if (!sock) return;

    const onState = (payload: unknown) => {
      setRating(normalizeRatingState(payload));
    };

    const onResult = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as {
        results?: Record<
          string,
          { tier: string; hiddenAverage?: number; name: string; color: string }
        >;
      };
      const raw = p.results ?? {};

      const merged: RatingRoundResult[] = Object.entries(raw).map(
        ([identityId, row]) => ({
          identityId,
          tier: isPeerTierLetter(row.tier) ? row.tier : "D",
          hiddenAverage:
            typeof row.hiddenAverage === "number" ? row.hiddenAverage : 0,
          name: row.name,
          color: row.color,
        })
      );

      setLastResults(merged);
      setRating(EMPTY_RATING);

      bankRound(
        merged.map((r) => ({
          id: r.identityId,
          tier: r.tier,
          hiddenAverage: r.hiddenAverage,
          name: r.name,
          color: r.color,
        }))
      );

      const top = merged.sort(
        (a, b) =>
          "SABCD".indexOf(a.tier) - "SABCD".indexOf(b.tier)
      )[0];
      toast.success(
        top ? `Round complete — ${top.name} leads at ${top.tier}` : "Round complete",
        { description: "Standings updated on the leaderboard." }
      );
      logActivity("rating_ended", "Peer rating round");
    };

    sock.on("rating:state", onState);
    sock.on("rating:result", onResult);

    return () => {
      sock.off("rating:state", onState);
      sock.off("rating:result", onResult);
    };
  }, [status, roomId, members, bankRound, logActivity]);

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
    const sock = getSocket();
    if (!sock?.connected) {
      toast.error("Not connected to the room server");
      return;
    }
    setLastResults(null);
    sock.emit("rating:start", { roomId: roomIdRef.current });
    setRating({
      active: true,
      submittedCount: 0,
      totalPeers: members.length,
      hasSubmitted: false,
    });
    logActivity("rating_started", "Anonymous peer ratings");
    toast("Rating round started", {
      description: "Rate each player — your votes stay private.",
    });
  }, [members.length, logActivity]);

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
