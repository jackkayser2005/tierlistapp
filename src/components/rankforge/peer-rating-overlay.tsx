"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ImageIcon, X, Zap, Hourglass, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePeerRating } from "@/hooks/use-peer-rating";
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
      aria-label="Rate cards"
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

function TargetCard({
  label,
  imageUrl,
  linkedPlayerName,
  linkedPlayerColor,
}: {
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
}) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = !!imageUrl && !imgError;

  return (
    <div className="flex items-center gap-3">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
        {showImage ? (
          <img
            src={imageUrl}
            alt={label}
            onError={() => setImgError(true)}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-1">
            <ImageIcon className="size-4 text-muted-foreground/70" />
            <span className="line-clamp-2 text-center text-[9px] font-semibold leading-tight">
              {label}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{label}</p>
        {linkedPlayerName ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
              style={{ backgroundColor: linkedPlayerColor ?? "#64748b" }}
            >
              {initials(linkedPlayerName)}
            </span>
            {linkedPlayerName}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
            No player linked
          </p>
        )}
      </div>
    </div>
  );
}

export function PeerRatingOverlay() {
  const {
    rating,
    canControl,
    submitBallot,
    endRatingRound,
    cancelRatingRound,
  } = usePeerRating();

  const targets = rating.targets;
  const [picks, setPicks] = React.useState<Record<string, PeerTierLetter>>({});

  React.useEffect(() => {
    if (!rating.active) setPicks({});
  }, [rating.active]);

  if (!rating.active || targets.length === 0) return null;

  const allPicked =
    targets.length > 0 &&
    targets.every((t) => picks[t.id] !== undefined);
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
              <User className="size-4.5 text-white" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Rate the cards</p>
              <p className="text-xs text-muted-foreground">
                Private votes ·{" "}
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
          Where does each card belong? Pick a tier for every unranked item.
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
              const picked = picks[target.id];
              return (
                <div
                  key={target.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <TargetCard
                    label={target.label}
                    imageUrl={target.imageUrl}
                    linkedPlayerName={target.linkedPlayerName}
                    linkedPlayerColor={target.linkedPlayerColor}
                  />
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {PEER_TIER_ORDER.map((letter) => {
                      const color = PEER_TIER_COLORS[letter];
                      const fg = readableTextOn(color);
                      const selected = picked === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            setPicks((prev) => ({ ...prev, [target.id]: letter }))
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
