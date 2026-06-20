"use client";

import type { RankForgeBoard, TierItem } from "./tierlist";
import { UNRANKED_ID } from "./tierlist";
import type { RoomUser } from "./presence";
import { memberKey } from "./presence";

export interface ScoredUser {
  userId: string;
  user: RoomUser | null;
  score: number;
  itemCount: number;
  /** Photo from this user's highest-point assigned image item. */
  avatarUrl?: string;
  avatarLabel: string;
  avatarColor: string;
}

function resolveMember(
  assignedId: string,
  members: RoomUser[]
): RoomUser | null {
  for (const m of members) {
    if (memberKey(m) === assignedId || m.id === assignedId) return m;
  }
  return null;
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

  const itemTier = new Map<string, string>();
  for (const t of board.tiers) {
    for (const itemId of board.tierItems[t.id] ?? []) {
      itemTier.set(itemId, t.id);
    }
  }
  for (const itemId of board.unranked) {
    itemTier.set(itemId, UNRANKED_ID);
  }

  const scores = new Map<
    string,
    {
      score: number;
      itemCount: number;
      bestItem: TierItem | null;
      bestPoints: number;
    }
  >();

  for (const item of Object.values(board.items)) {
    if (!item.assignedUserId) continue;
    const tierId = itemTier.get(item.id) ?? UNRANKED_ID;
    const pts = tierId === UNRANKED_ID ? 0 : (tierPoints.get(tierId) ?? 0);

    // Normalize legacy socket-id assignments to stable identityId when possible.
    const member = resolveMember(item.assignedUserId, members);
    const stableId = member ? memberKey(member) : item.assignedUserId;

    const existing = scores.get(stableId);
    if (existing) {
      existing.score += pts;
      existing.itemCount += 1;
      if (item.imageUrl && pts >= existing.bestPoints) {
        existing.bestItem = item;
        existing.bestPoints = pts;
      }
    } else {
      scores.set(stableId, {
        score: pts,
        itemCount: 1,
        bestItem: item.imageUrl ? item : null,
        bestPoints: item.imageUrl ? pts : -1,
      });
    }
  }

  const result: ScoredUser[] = [];
  for (const [userId, data] of scores) {
    const member = resolveMember(userId, members);
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

  result.sort((a, b) => b.score - a.score || b.itemCount - a.itemCount);
  return result;
}
