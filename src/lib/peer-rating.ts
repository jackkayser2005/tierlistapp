/**
 * Anonymous peer-rating math. Internal point values are NEVER shown in the UI.
 * D=0, C=1, B=2, A=3, S=4.35 (so a strong S consensus can reach S without unanimity).
 */

export type PeerTierLetter = "S" | "A" | "B" | "C" | "D";

export const PEER_TIER_ORDER: PeerTierLetter[] = ["S", "A", "B", "C", "D"];

/** Hidden weights — do not render these anywhere in the product UI. */
const TIER_VALUE: Record<PeerTierLetter, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  S: 4.35,
};

const VALUE_TO_TIER: PeerTierLetter[] = ["D", "C", "B", "A", "S"];

export function isPeerTierLetter(v: string): v is PeerTierLetter {
  return v === "S" || v === "A" || v === "B" || v === "C" || v === "D";
}

export function tierToHiddenValue(tier: PeerTierLetter): number {
  return TIER_VALUE[tier];
}

/** Map a hidden average back to a display tier (integer bucket: 0→D … 4+→S). */
export function hiddenAverageToTier(avg: number): PeerTierLetter {
  const idx = Math.min(4, Math.max(0, Math.floor(avg)));
  return VALUE_TO_TIER[idx];
}

export function tierRank(tier: PeerTierLetter): number {
  return PEER_TIER_ORDER.indexOf(tier);
}

/** Sort best (S) first. */
export function compareTiers(a: PeerTierLetter, b: PeerTierLetter): number {
  return tierRank(a) - tierRank(b);
}

export interface PeerRatingResult {
  identityId: string;
  tier: PeerTierLetter;
  /** Round average of hidden values — internal only, never shown. */
  hiddenAverage: number;
  name: string;
  color: string;
}

/**
 * Compute each member's tier from anonymous ballots.
 * `ballots`: voterIdentityId → (targetIdentityId → tier letter)
 */
export function computePeerRatingResults(
  members: { identityId: string; name: string; color: string }[],
  ballots: Record<string, Record<string, PeerTierLetter>>
): PeerRatingResult[] {
  const results: PeerRatingResult[] = [];

  for (const target of members) {
    let sum = 0;
    let count = 0;
    for (const ballot of Object.values(ballots)) {
      const pick = ballot[target.identityId];
      if (!pick) continue;
      sum += tierToHiddenValue(pick);
      count += 1;
    }
    if (count === 0) continue;
    const playerCount = Math.max(1, members.length);
    const hiddenAverage = sum / playerCount;
    results.push({
      identityId: target.identityId,
      tier: hiddenAverageToTier(hiddenAverage),
      hiddenAverage,
      name: target.name,
      color: target.color,
    });
  }

  results.sort(
    (a, b) =>
      compareTiers(a.tier, b.tier) ||
      a.name.localeCompare(b.name)
  );
  return results;
}

/** Default hex colors for tier badges on the leaderboard. */
export const PEER_TIER_COLORS: Record<PeerTierLetter, string> = {
  S: "#dc2626",
  A: "#ea580c",
  B: "#ca8a04",
  C: "#0d9488",
  D: "#475569",
};
