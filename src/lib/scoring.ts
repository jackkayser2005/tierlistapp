"use client";

import type { BankedScore } from "./tierlist";
import {
  compareTiers,
  hiddenAverageToTier,
  type PeerTierLetter,
} from "./peer-rating";

export interface RankedItem {
  itemId: string;
  tier: PeerTierLetter;
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
  rounds: number;
}

/** Build a sorted leaderboard from banked item ratings (tiers only, no points). */
export function buildItemLeaderboard(
  bankedScores: Record<string, BankedScore>
): RankedItem[] {
  const rows: RankedItem[] = [];

  for (const [itemId, b] of Object.entries(bankedScores)) {
    rows.push({
      itemId,
      tier: b.tier,
      label: b.label,
      imageUrl: b.imageUrl,
      linkedPlayerName: b.linkedPlayerName,
      linkedPlayerColor: b.linkedPlayerColor,
      rounds: b.rounds ?? 1,
    });
  }

  rows.sort(
    (a, b) =>
      compareTiers(a.tier, b.tier) ||
      a.label.localeCompare(b.label)
  );
  return rows;
}

/** Merge a finished round into cumulative banked scores (running hidden average). */
export function mergeRoundIntoBanked(
  existing: Record<string, BankedScore>,
  roundResults: {
    id: string;
    tier: PeerTierLetter;
    hiddenAverage: number;
    label: string;
    imageUrl?: string;
    linkedPlayerName?: string;
    linkedPlayerColor?: string;
  }[]
): Record<string, BankedScore> {
  const next: Record<string, BankedScore> = {};
  for (const [id, b] of Object.entries(existing)) {
    next[id] = { ...b };
  }
  for (const r of roundResults) {
    const prev = next[r.id];
    if (prev) {
      const rounds = (prev.rounds ?? 1) + 1;
      const hiddenAverage =
        ((prev.hiddenAverage ?? 0) * (prev.rounds ?? 1) + r.hiddenAverage) /
        rounds;
      next[r.id] = {
        label: r.label,
        ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
        ...(r.linkedPlayerName ? { linkedPlayerName: r.linkedPlayerName } : {}),
        ...(r.linkedPlayerColor
          ? { linkedPlayerColor: r.linkedPlayerColor }
          : {}),
        tier: hiddenAverageToTier(hiddenAverage),
        hiddenAverage,
        rounds,
      };
    } else {
      next[r.id] = {
        label: r.label,
        ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
        ...(r.linkedPlayerName ? { linkedPlayerName: r.linkedPlayerName } : {}),
        ...(r.linkedPlayerColor
          ? { linkedPlayerColor: r.linkedPlayerColor }
          : {}),
        tier: r.tier,
        hiddenAverage: r.hiddenAverage,
        rounds: 1,
      };
    }
  }
  return next;
}
