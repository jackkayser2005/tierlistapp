"use client";

import type { BankedScore, Tier } from "./tierlist";

export interface VoteStandingEntry {
  id: string;
  label: string;
  tierId: string;
  tierName: string;
  tierColor: string;
  voteCount: number;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
}

export interface StandingsRow {
  itemId: string;
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
  tierId: string;
  tierName: string;
  tierColor: string;
  lastVoteCount: number;
  rounds: number;
  /** Current row on the board, e.g. "S" or "Unranked". */
  boardLabel: string;
  /** True when the card sits on the tier row from its last group vote. */
  matchesBoard: boolean;
}

export interface PendingVoteItem {
  itemId: string;
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
}

function tierSortIndex(tierId: string, tiers: Tier[]): number {
  const idx = tiers.findIndex((t) => t.id === tierId);
  return idx === -1 ? 999 : idx;
}

/** Where a card currently sits on the tier board (null = unranked pool). */
export function getItemBoardTierName(
  itemId: string,
  tiers: Tier[],
  tierItems: Record<string, string[]>,
  unranked: string[]
): string | null {
  if (unranked.includes(itemId)) return null;
  for (const tier of tiers) {
    if ((tierItems[tier.id] ?? []).includes(itemId)) return tier.name;
  }
  return null;
}

export function getItemBoardTierId(
  itemId: string,
  tiers: Tier[],
  tierItems: Record<string, string[]>,
  unranked: string[]
): string | null {
  if (unranked.includes(itemId)) return null;
  for (const tier of tiers) {
    if ((tierItems[tier.id] ?? []).includes(itemId)) return tier.id;
  }
  return null;
}

/** Record a finished group vote into standings. */
export function recordVoteResults(
  existing: Record<string, BankedScore>,
  entries: VoteStandingEntry[]
): Record<string, BankedScore> {
  const next: Record<string, BankedScore> = {};
  for (const [id, b] of Object.entries(existing)) {
    next[id] = { ...b };
  }
  for (const e of entries) {
    const prev = next[e.id];
    next[e.id] = {
      label: e.label,
      tierId: e.tierId,
      tierName: e.tierName,
      tierColor: e.tierColor,
      lastVoteCount: e.voteCount,
      rounds: (prev?.rounds ?? 0) + 1,
      ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
      ...(e.linkedPlayerName ? { linkedPlayerName: e.linkedPlayerName } : {}),
      ...(e.linkedPlayerColor
        ? { linkedPlayerColor: e.linkedPlayerColor }
        : {}),
    };
  }
  return next;
}

/** Build standings sorted by tier row order (top row first), then label. */
export function buildStandingsRows(
  bankedScores: Record<string, BankedScore>,
  tiers: Tier[],
  tierItems: Record<string, string[]>,
  unranked: string[]
): StandingsRow[] {
  const rows: StandingsRow[] = [];

  for (const [itemId, b] of Object.entries(bankedScores)) {
    const boardTierId = getItemBoardTierId(itemId, tiers, tierItems, unranked);
    const boardName = getItemBoardTierName(itemId, tiers, tierItems, unranked);
    rows.push({
      itemId,
      label: b.label,
      imageUrl: b.imageUrl,
      linkedPlayerName: b.linkedPlayerName,
      linkedPlayerColor: b.linkedPlayerColor,
      tierId: b.tierId,
      tierName: b.tierName,
      tierColor: b.tierColor,
      lastVoteCount: b.lastVoteCount,
      rounds: b.rounds ?? 1,
      boardLabel: boardName ?? "Unranked",
      matchesBoard: boardTierId != null && boardTierId === b.tierId,
    });
  }

  rows.sort(
    (a, b) =>
      tierSortIndex(a.tierId, tiers) - tierSortIndex(b.tierId, tiers) ||
      a.label.localeCompare(b.label)
  );
  return rows;
}

/** Group standings by the tier row they were voted into. */
export function groupStandingsByTierRow(
  rows: StandingsRow[],
  tiers: Tier[]
): { tierId: string; tierName: string; tierColor: string; rows: StandingsRow[] }[] {
  const order = tiers.map((t) => t.id);
  const buckets = new Map<string, StandingsRow[]>();
  for (const row of rows) {
    const list = buckets.get(row.tierId) ?? [];
    list.push(row);
    buckets.set(row.tierId, list);
  }
  const seen = new Set<string>();
  const groups: {
    tierId: string;
    tierName: string;
    tierColor: string;
    rows: StandingsRow[];
  }[] = [];
  for (const tierId of order) {
    const tierRows = buckets.get(tierId);
    if (!tierRows?.length) continue;
    seen.add(tierId);
    const tier = tiers.find((t) => t.id === tierId);
    groups.push({
      tierId,
      tierName: tier?.name ?? tierRows[0].tierName,
      tierColor: tier?.color ?? tierRows[0].tierColor,
      rows: tierRows,
    });
  }
  for (const [tierId, tierRows] of buckets) {
    if (seen.has(tierId) || !tierRows.length) continue;
    groups.push({
      tierId,
      tierName: tierRows[0].tierName,
      tierColor: tierRows[0].tierColor,
      rows: tierRows,
    });
  }
  return groups;
}

/** Unranked cards not yet placed by a group vote. */
export function buildPendingVoteItems(
  items: Record<
    string,
    { id: string; label: string; imageUrl?: string; assignedUserId?: string }
  >,
  unranked: string[],
  bankedScores: Record<string, BankedScore>,
  members: { identityId?: string; id: string; name: string }[]
): PendingVoteItem[] {
  return unranked
    .filter((id) => !bankedScores[id])
    .map((id) => {
      const item = items[id];
      if (!item) return null;
      let linkedPlayerName: string | undefined;
      if (item.assignedUserId) {
        linkedPlayerName = members.find(
          (m) =>
            m.identityId === item.assignedUserId || m.id === item.assignedUserId
        )?.name;
      }
      return {
        itemId: item.id,
        label: item.label,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        ...(linkedPlayerName ? { linkedPlayerName } : {}),
      };
    })
    .filter((row): row is PendingVoteItem => row !== null);
}
