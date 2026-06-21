"use client";

import type { BankedScore } from "./tierlist";
import type { RoomUser } from "./presence";
import { memberKey } from "./presence";
import {
  compareTiers,
  hiddenAverageToTier,
  type PeerTierLetter,
} from "./peer-rating";

export interface RankedPlayer {
  userId: string;
  user: RoomUser | null;
  tier: PeerTierLetter;
  name: string;
  color: string;
  rounds: number;
}

function resolveMember(id: string, members: RoomUser[]): RoomUser | null {
  for (const m of members) {
    if (memberKey(m) === id || m.id === id) return m;
  }
  return null;
}

/** Build a sorted leaderboard from banked peer-rating results (tiers only, no points). */
export function buildPlayerLeaderboard(
  bankedScores: Record<string, BankedScore>,
  members: RoomUser[]
): RankedPlayer[] {
  const rows: RankedPlayer[] = [];

  for (const [userId, b] of Object.entries(bankedScores)) {
    const member = resolveMember(userId, members);
    rows.push({
      userId,
      user: member,
      tier: b.tier,
      name: member?.name ?? b.name,
      color: member?.color ?? b.color,
      rounds: b.rounds ?? 1,
    });
  }

  rows.sort(
    (a, b) => compareTiers(a.tier, b.tier) || a.name.localeCompare(b.name)
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
    name: string;
    color: string;
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
        ((prev.hiddenAverage ?? 0) * (prev.rounds ?? 1) + r.hiddenAverage) / rounds;
      next[r.id] = {
        name: r.name,
        color: r.color,
        tier: hiddenAverageToTier(hiddenAverage),
        hiddenAverage,
        rounds,
      };
    } else {
      next[r.id] = {
        name: r.name,
        color: r.color,
        tier: r.tier,
        hiddenAverage: r.hiddenAverage,
        rounds: 1,
      };
    }
  }
  return next;
}
