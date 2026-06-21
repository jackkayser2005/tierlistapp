"use client";

import type { Tier, TierItem } from "./tierlist";
import { UNRANKED_ID } from "./tierlist";
import type { RoomUser } from "./presence";
import { memberKey } from "./presence";
import type { PeerTierLetter } from "./peer-rating";

/** An unranked card up for anonymous peer rating. */
export interface RatingTarget {
  id: string;
  label: string;
  imageUrl?: string;
  linkedPlayerId?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
}

export function buildRatingTargets(
  items: Record<string, TierItem>,
  unranked: string[],
  members: RoomUser[]
): RatingTarget[] {
  return unranked.map((id) => {
    const item = items[id];
    if (!item) return null;
    let linkedPlayerName: string | undefined;
    let linkedPlayerColor: string | undefined;
    if (item.assignedUserId) {
      const linked = members.find(
        (m) =>
          memberKey(m) === item.assignedUserId || m.id === item.assignedUserId
      );
      linkedPlayerName = linked?.name;
      linkedPlayerColor = linked?.color;
    }
    return {
      id: item.id,
      label: item.label,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.assignedUserId ? { linkedPlayerId: item.assignedUserId } : {}),
      ...(linkedPlayerName ? { linkedPlayerName } : {}),
      ...(linkedPlayerColor ? { linkedPlayerColor } : {}),
    };
  }).filter((t): t is RatingTarget => t !== null);
}

/** Move rated items from unranked into tiers matching their result letter. */
export function applyRatingPlacements(
  tiers: Tier[],
  unranked: string[],
  placements: { itemId: string; tier: PeerTierLetter }[],
  moveItem: (
    itemId: string,
    from: string,
    to: string,
    toIndex: number
  ) => void
): number {
  let moved = 0;
  for (const p of placements) {
    if (!unranked.includes(p.itemId)) continue;
    const tier = tiers.find(
      (t) => t.name.trim().toUpperCase() === p.tier.toUpperCase()
    );
    if (!tier) continue;
    moveItem(p.itemId, UNRANKED_ID, tier.id, -1);
    moved += 1;
  }
  return moved;
}
