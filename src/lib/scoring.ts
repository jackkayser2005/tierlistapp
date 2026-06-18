"use client";

import type { RankForgeBoard, TierItem } from "./tierlist";
import { UNRANKED_ID } from "./tierlist";
import type { RoomUser } from "./presence";

export interface ScoredUser {
  userId: string;
  user: RoomUser | null;
  score: number;
  itemCount: number;
  /** The image to use as this user's avatar (from their highest-point assigned item). */
  avatarUrl?: string;
  avatarLabel: string;
  avatarColor: string;
}

/**
 * Compute leaderboard scores: for each user who has at least one assigned
 * item, sum the points of the tiers their items sit in. Unranked items
 * contribute 0 points. Returns users sorted by score descending.
 */
export function computeLeaderboard(
  board: RankForgeBoard,
  members: RoomUser[]
): ScoredUser[] {
  const tierPoints = new Map<string, number>();
  for (const t of board.tiers) tierPoints.set(t.id, t.points ?? 0);

  // itemId -> tierId (which tier it's in, or UNRANKED).
  const itemTier = new Map<string, string>();
  for (const t of board.tiers) {
    for (const itemId of board.tierItems[t.id] ?? []) {
      itemTier.set(itemId, t.id);
    }
  }
  for (const itemId of board.unranked) {
    itemTier.set(itemId, UNRANKED_ID);
  }

  // Accumulate per assignedUserId.
  const scores = new Map<
    string,
    { score: number; itemCount: number; bestItem: TierItem | null; bestPoints: number }
  >();

  for (const item of Object.values(board.items)) {
    if (!item.assignedUserId) continue;
    const tierId = itemTier.get(item.id) ?? UNRANKED_ID;
    const pts = tierId === UNRANKED_ID ? 0 : (tierPoints.get(tierId) ?? 0);
    const existing = scores.get(item.assignedUserId);
    if (existing) {
      existing.score += pts;
      existing.itemCount += 1;
      // Track the highest-point item with an image for the avatar.
      if (item.imageUrl && pts > existing.bestPoints) {
        existing.bestItem = item;
        existing.bestPoints = pts;
      }
    } else {
      scores.set(item.assignedUserId, {
        score: pts,
        itemCount: 1,
        bestItem: item.imageUrl ? item : null,
        bestPoints: item.imageUrl ? pts : -1,
      });
    }
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));

  const result: ScoredUser[] = [];
  for (const [userId, data] of scores) {
    const member = memberMap.get(userId) ?? null;
    const avatarItem = data.bestItem;
    result.push({
      userId,
      user: member,
      score: data.score,
      itemCount: data.itemCount,
      avatarUrl: avatarItem?.imageUrl,
      avatarLabel: member?.name ?? "?",
      avatarColor: member?.color ?? "#64748b",
    });
  }

  // Sort by score desc, then by item count desc.
  result.sort((a, b) => b.score - a.score || b.itemCount - a.itemCount);
  return result;
}
