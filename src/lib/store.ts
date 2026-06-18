"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createDefaultBoard,
  createTierId,
  normalizeBoard,
  UNRANKED_ID,
  type RankForgeBoard,
  type Tier,
  type TierItem,
} from "./tierlist";

interface RankForgeState extends RankForgeBoard {
  // ---- item actions ----
  addItem: (
    item: Omit<TierItem, "id">,
    container?: string | null
  ) => void;
  deleteItem: (itemId: string) => void;
  updateItemLabel: (itemId: string, label: string) => void;
  assignItem: (itemId: string, userId: string | undefined) => void;
  moveItem: (
    itemId: string,
    fromContainer: string,
    toContainer: string,
    toIndex: number
  ) => void;
  clearContainer: (container: string) => void;

  // ---- tier actions ----
  addTier: () => void;
  updateTier: (tierId: string, patch: Partial<Pick<Tier, "name" | "color" | "points">>) => void;
  deleteTier: (tierId: string) => void;
  reorderTier: (tierId: string, direction: "up" | "down") => void;

  // ---- board actions ----
  setMeta: (patch: Partial<Pick<RankForgeBoard, "title" | "description">>) => void;
  resetBoard: () => void;
  loadBoard: (board: RankForgeBoard) => void;

  // ---- selectors / helpers ----
  findContainerOf: (itemId: string) => string | null;
  indexOfItem: (container: string, itemId: string) => number;
  containerIds: () => string[];
}

const STORAGE_KEY = "rankforge-board-v1";

function arrayWithout<T>(arr: T[], value: T): T[] {
  const i = arr.indexOf(value);
  if (i === -1) return arr;
  const next = arr.slice();
  next.splice(i, 1);
  return next;
}

export const useRankForge = create<RankForgeState>()(
  persist(
    (set, get) => ({
      ...createDefaultBoard(),

      addItem: (item, container = null) =>
        set((state) => {
          const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? `item_${crypto.randomUUID()}`
              : `item_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
          const newItem: TierItem = { id, ...item };
          const items = { ...state.items, [id]: newItem };
          if (container === null || container === UNRANKED_ID) {
            return { items, unranked: [...state.unranked, id] };
          }
          return {
            items,
            tierItems: {
              ...state.tierItems,
              [container]: [...(state.tierItems[container] ?? []), id],
            },
          };
        }),

      deleteItem: (itemId) =>
        set((state) => {
          const items = { ...state.items };
          delete items[itemId];
          const tierItems: Record<string, string[]> = {};
          for (const [tid, arr] of Object.entries(state.tierItems)) {
            tierItems[tid] = arrayWithout(arr, itemId);
          }
          return {
            items,
            tierItems,
            unranked: arrayWithout(state.unranked, itemId),
          };
        }),

      updateItemLabel: (itemId, label) =>
        set((state) => {
          const existing = state.items[itemId];
          if (!existing) return state;
          return {
            items: { ...state.items, [itemId]: { ...existing, label } },
          };
        }),

      assignItem: (itemId, userId) =>
        set((state) => {
          const existing = state.items[itemId];
          if (!existing) return state;
          const next = { ...existing };
          if (userId) next.assignedUserId = userId;
          else delete next.assignedUserId;
          return { items: { ...state.items, [itemId]: next } };
        }),

      moveItem: (itemId, fromContainer, toContainer, toIndex) =>
        set((state) => {
          const fromArr =
            fromContainer === UNRANKED_ID
              ? state.unranked.slice()
              : (state.tierItems[fromContainer] ?? []).slice();
          const fromIndex = fromArr.indexOf(itemId);
          if (fromIndex === -1) return state;

          // Same container -> reorder in place.
          if (fromContainer === toContainer) {
            fromArr.splice(fromIndex, 1);
            const insertAt =
              toIndex < 0
                ? fromArr.length
                : Math.max(0, Math.min(toIndex, fromArr.length));
            fromArr.splice(insertAt, 0, itemId);
            if (fromContainer === UNRANKED_ID) {
              return { unranked: fromArr };
            }
            return {
              tierItems: { ...state.tierItems, [fromContainer]: fromArr },
            };
          }

          // Different containers.
          const toArr =
            toContainer === UNRANKED_ID
              ? state.unranked.slice()
              : (state.tierItems[toContainer] ?? []).slice();
          fromArr.splice(fromIndex, 1);
          const insertAt =
            toIndex < 0
              ? toArr.length
              : Math.max(0, Math.min(toIndex, toArr.length));
          toArr.splice(insertAt, 0, itemId);

          const tierItems = { ...state.tierItems };
          if (fromContainer !== UNRANKED_ID) tierItems[fromContainer] = fromArr;
          if (toContainer !== UNRANKED_ID) tierItems[toContainer] = toArr;
          const unranked =
            fromContainer === UNRANKED_ID
              ? fromArr
              : toContainer === UNRANKED_ID
                ? toArr
                : state.unranked;

          return { tierItems, unranked };
        }),

      clearContainer: (container) =>
        set((state) => {
          if (container === UNRANKED_ID) return { unranked: [] };
          return {
            tierItems: { ...state.tierItems, [container]: [] },
          };
        }),

      addTier: () =>
        set((state) => {
          const id = createTierId();
          const newTier: Tier = { id, name: "New", color: "#8b5cf6" };
          return {
            tiers: [...state.tiers, newTier],
            tierItems: { ...state.tierItems, [id]: [] },
          };
        }),

      updateTier: (tierId, patch) =>
        set((state) => ({
          tiers: state.tiers.map((t) =>
            t.id === tierId ? { ...t, ...patch } : t
          ),
        })),

      deleteTier: (tierId) =>
        set((state) => {
          const tier = state.tiers.find((t) => t.id === tierId);
          if (!tier) return state;
          // Move any items in the deleted tier back to the unranked pool.
          const orphanIds = state.tierItems[tierId] ?? [];
          const tierItems = { ...state.tierItems };
          delete tierItems[tierId];
          return {
            tiers: state.tiers.filter((t) => t.id !== tierId),
            tierItems,
            unranked: [...state.unranked, ...orphanIds],
          };
        }),

      reorderTier: (tierId, direction) =>
        set((state) => {
          const idx = state.tiers.findIndex((t) => t.id === tierId);
          if (idx === -1) return state;
          const target = direction === "up" ? idx - 1 : idx + 1;
          if (target < 0 || target >= state.tiers.length) return state;
          const tiers = state.tiers.slice();
          const [moved] = tiers.splice(idx, 1);
          tiers.splice(target, 0, moved);
          return { tiers };
        }),

      setMeta: (patch) =>
        set((state) => ({ ...state, ...patch })),

      resetBoard: () =>
        set(() => ({
          ...createDefaultBoard(),
        })),

      loadBoard: (board) =>
        set(() => ({
          title: board.title,
          description: board.description,
          tiers: board.tiers,
          items: board.items,
          tierItems: board.tierItems,
          unranked: board.unranked,
        })),

      findContainerOf: (itemId) => {
        const state = get();
        if (state.unranked.includes(itemId)) return UNRANKED_ID;
        for (const t of state.tiers) {
          if ((state.tierItems[t.id] ?? []).includes(itemId)) return t.id;
        }
        return null;
      },

      indexOfItem: (container, itemId) => {
        const state = get();
        const arr =
          container === UNRANKED_ID
            ? state.unranked
            : (state.tierItems[container] ?? []);
        return arr.indexOf(itemId);
      },

      containerIds: () => {
        const state = get();
        return [...state.tiers.map((t) => t.id), UNRANKED_ID];
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Only persist the board data, not the action functions.
      partialize: (state) => ({
        title: state.title,
        description: state.description,
        tiers: state.tiers,
        items: state.items,
        tierItems: state.tierItems,
        unranked: state.unranked,
      }),
      migrate: (persisted: unknown) => {
        try {
          return normalizeBoard(persisted);
        } catch {
          return createDefaultBoard();
        }
      },
    }
  )
);

/** Build a JSON-serializable export payload. */
export function buildExport(board: RankForgeBoard): RankForgeExport {
  return {
    app: "rankforge",
    version: 1,
    exportedAt: new Date().toISOString(),
    board,
  };
}

export { normalizeBoard };
export type { RankForgeExport };
