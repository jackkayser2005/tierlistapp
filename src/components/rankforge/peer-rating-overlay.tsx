"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Users, X, Zap, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMultiplayer } from "@/hooks/use-multiplayer";
import { usePeerRating } from "@/hooks/use-peer-rating";
import { memberKey } from "@/lib/presence";
import {
  PEER_TIER_COLORS,
  PEER_TIER_ORDER,
  type PeerTierLetter,
} from "@/lib/peer-rating";
import { readableTextOn } from "@/lib/tierlist";

function ModalLayer({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  React.useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Rate players"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      {children}
    </div>,
    document.body
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PeerRatingOverlay() {
  const { members, user } = useMultiplayer();
  const {
    rating,
    canControl,
    submitBallot,
    endRatingRound,
    cancelRatingRound,
  } = usePeerRating();

  const targets = React.useMemo(
    () => members.filter((m) => memberKey(m) !== user.id),
    [members, user.id]
  );

  const [picks, setPicks] = React.useState<Record<string, PeerTierLetter>>({});

  React.useEffect(() => {
    if (!rating.active) setPicks({});
  }, [rating.active]);

  if (!rating.active) return null;

  const allPicked =
    targets.length > 0 &&
    targets.every((t) => picks[memberKey(t)] !== undefined);
  const everyoneSubmitted =
    rating.totalPeers > 0 &&
    rating.submittedCount >= rating.totalPeers;

  const handleSubmit = () => {
    if (!allPicked || rating.hasSubmitted) return;
    submitBallot(picks);
  };

  return (
    <ModalLayer onClose={canControl ? cancelRatingRound : undefined}>
      <div className="rf-pop-in rf-panel relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rf-scroll rounded-3xl p-6 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rf-brand rf-glow grid size-9 place-items-center rounded-xl">
              <Users className="size-4.5 text-white" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Rate the group</p>
              <p className="text-xs text-muted-foreground">
                Your picks are private ·{" "}
                <span className="font-semibold text-foreground/80">
                  {rating.submittedCount}
                </span>{" "}
                of {rating.totalPeers} submitted
              </p>
            </div>
          </div>
          {canControl ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={cancelRatingRound}
              >
                <X className="size-4" /> Cancel
              </Button>
              <Button
                size="sm"
                className={cn("rf-btn-accent", everyoneSubmitted && "rf-glow")}
                onClick={endRatingRound}
              >
                <Zap className="size-4" /> Finish
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Hourglass className="size-3" />
              Host closes it
            </span>
          )}
        </div>

        <p className="mb-4 text-center text-sm text-muted-foreground">
          Where does each person belong? Tap a tier for every player.
        </p>

        {rating.hasSubmitted ? (
          <div className="rf-inset flex flex-col items-center gap-2 rounded-xl py-10 text-center">
            <Check className="size-8 text-emerald-400" />
            <p className="text-sm font-semibold">Ballot submitted</p>
            <p className="text-xs text-muted-foreground">
              Waiting for the rest of the group…
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {targets.map((target) => {
              const id = memberKey(target);
              const picked = picks[id];
              return (
                <div
                  key={target.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: target.color }}
                    >
                      {initials(target.name)}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {target.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {PEER_TIER_ORDER.map((letter) => {
                      const color = PEER_TIER_COLORS[letter];
                      const fg = readableTextOn(color);
                      const selected = picked === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            setPicks((prev) => ({ ...prev, [id]: letter }))
                          }
                          className={cn(
                            "rounded-lg py-2 text-sm font-black uppercase transition active:scale-95",
                            selected
                              ? "ring-2 ring-white/70 ring-offset-2 ring-offset-background"
                              : "opacity-80 hover:opacity-100"
                          )}
                          style={{
                            background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`,
                            color: fg,
                          }}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <Button
              className="rf-btn-accent w-full"
              disabled={!allPicked}
              onClick={handleSubmit}
            >
              Submit ratings
            </Button>
          </div>
        )}
      </div>
    </ModalLayer>
  );
}
