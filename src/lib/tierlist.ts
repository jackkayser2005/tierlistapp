// Core domain types and default data for RankForge.

export type ItemType = "text" | "image";

export interface TierItem {
  id: string;
  type: ItemType;
  label: string;
  /** Present only for image items. May be a remote URL or a local /public path. */
  imageUrl?: string;
  /** The stable player id this card represents (optional — card can still be voted without one). */
  assignedUserId?: string;
}

export interface Tier {
  id: string;
  name: string;
  /** Hex color string, e.g. "#ef4444". */
  color: string;
  /** Legacy numeric weight — not shown in UI; kept for board import compatibility. */
  points: number;
}

/** Special container id used for the unranked pool. */
export const UNRANKED_ID = "__unranked__";

/** Group-vote result for an item — updated each time a vote places it on the board. */
export interface BankedScore {
  label: string;
  imageUrl?: string;
  linkedPlayerName?: string;
  linkedPlayerColor?: string;
  /** Tier row the group vote placed this card in. */
  tierId: string;
  tierName: string;
  tierColor: string;
  /** Votes the winning tier received in the last vote on this item. */
  lastVoteCount: number;
  /** How many times this item has been through a group vote. */
  rounds: number;
}

export interface RankForgeBoard {
  title: string;
  description: string;
  tiers: Tier[];
  items: Record<string, TierItem>;
  /** tierId -> ordered item ids. */
  tierItems: Record<string, string[]>;
  /** ordered item ids in the unranked pool. */
  unranked: string[];
  /** itemId -> group-vote placement history. */
  bankedScores: Record<string, BankedScore>;
}

export const RANKFORGE_VERSION = 1;

export interface RankForgeExport {
  app: "rankforge";
  version: number;
  exportedAt: string;
  board: RankForgeBoard;
}

/** Curated palette offered in the tier color picker — refined, harmonious. */
export const TIER_COLOR_PRESETS: string[] = [
  "#9f1239", // crimson
  "#dc2626", // red
  "#ea580c", // orange
  "#d97706", // amber
  "#ca8a04", // gold
  "#65a30d", // olive
  "#16a34a", // green
  "#0d9488", // teal
  "#0891b2", // cyan
  "#0284c7", // sky
  "#2563eb", // blue
  "#4f46e5", // indigo
  "#7c3aed", // violet
  "#9333ea", // purple
  "#c026d3", // fuchsia
  "#db2777", // pink
  "#e11d48", // rose
  "#475569", // slate
];

const DEFAULT_TIER_COLORS: Record<string, string> = {
  S: "#dc2626",
  A: "#ea580c",
  B: "#ca8a04",
  C: "#0d9488",
  D: "#475569",
};

/** Default points for the standard 5-tier layout (S=5 … D=1). */
const DEFAULT_TIER_POINTS: Record<string, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

function makeId(prefix: string): string {
  // Compact unique id; crypto.randomUUID if available, else fallback.
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

export function createItemId(): string {
  return makeId("item");
}

export function createTierId(): string {
  return makeId("tier");
}

/** Build the starter board so the app never looks empty. */
export function createDefaultBoard(): RankForgeBoard {
  const tiers: Tier[] = ["S", "A", "B", "C", "D"].map((name, i) => ({
    id: createTierId(),
    name,
    color: DEFAULT_TIER_COLORS[name] ?? "#64748b",
    points: DEFAULT_TIER_POINTS[name] ?? Math.max(0, 5 - i),
  }));

  const items: Record<string, TierItem> = {};
  const tierItems: Record<string, string[]> = {};
  for (const t of tiers) tierItems[t.id] = [];
  const unranked: string[] = [];

  const push = (
    tierId: string | null,
    item: Omit<TierItem, "id">
  ): string => {
    const id = createItemId();
    items[id] = { id, ...item };
    if (tierId === null) unranked.push(id);
    else tierItems[tierId].push(id);
    return id;
  };

  // A few items already ranked to set the scene.
  push(tiers[0].id, {
    type: "image",
    label: "Pepperoni Pizza",
    imageUrl: "/starter/pizza.png",
  });
  push(tiers[0].id, { type: "text", label: "Inside Jokes 🔥" });
  push(tiers[1].id, {
    type: "image",
    label: "Smash Burger",
    imageUrl: "/starter/burger.png",
  });
  push(tiers[1].id, { type: "text", label: "Late Night Diners" });
  push(tiers[2].id, { type: "text", label: "Tacos" });
  push(tiers[3].id, { type: "text", label: "Re-runs" });

  // A healthy unranked pool to play with.
  push(null, {
    type: "image",
    label: "Arcade Night",
    imageUrl: "/starter/arcade.png",
  });
  push(null, {
    type: "image",
    label: "Street Tacos",
    imageUrl: "/starter/tacos.png",
  });
  push(null, { type: "text", label: "Group Trip 🚗" });
  push(null, { type: "text", label: "Karaoke" });
  push(null, { type: "text", label: "Memes Folder" });
  push(null, { type: "text", label: "That One Movie" });

  return {
    title: "Friday Night Tier List",
    description:
      "Settle the debate — drag everything where it belongs, then argue about it.",
    tiers,
    items,
    tierItems,
    unranked,
    bankedScores: {},
  };
}

/** Build a fresh, empty board: the standard S–D tiers, no items. */
export function createEmptyBoard(): RankForgeBoard {
  const tiers: Tier[] = ["S", "A", "B", "C", "D"].map((name, i) => ({
    id: createTierId(),
    name,
    color: DEFAULT_TIER_COLORS[name] ?? "#64748b",
    points: DEFAULT_TIER_POINTS[name] ?? Math.max(0, 5 - i),
  }));
  const tierItems: Record<string, string[]> = {};
  for (const t of tiers) tierItems[t.id] = [];
  return {
    title: "My Tier List",
    description: "",
    tiers,
    items: {},
    tierItems,
    unranked: [],
    bankedScores: {},
  };
}

/** Light validation + normalization for imported JSON. */
export function normalizeBoard(input: unknown): RankForgeBoard {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid file: expected a JSON object.");
  }
  const obj = input as Record<string, unknown>;

  // Accept either a raw board or a wrapped export ({ board: {...} }).
  const board = (obj.board && typeof obj.board === "object"
    ? (obj.board as Record<string, unknown>)
    : obj) as Record<string, unknown>;

  const title = typeof board.title === "string" ? board.title : "Imported Tier List";
  const description =
    typeof board.description === "string"
      ? board.description
      : "Imported from a shared file.";

  if (!Array.isArray(board.tiers)) throw new Error("Invalid file: missing tiers.");
  if (!board.items || typeof board.items !== "object")
    throw new Error("Invalid file: missing items.");

  const tiers: Tier[] = [];
  const seenTierIds = new Set<string>();
  for (const raw of board.tiers as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const id =
      typeof t.id === "string" && t.id ? t.id : createTierId();
    const name = typeof t.name === "string" ? t.name : "Tier";
    const color =
      typeof t.color === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(t.color)
        ? t.color.startsWith("#")
          ? t.color
          : `#${t.color}`
        : "#64748b";
    if (seenTierIds.has(id)) continue;
    seenTierIds.add(id);
    const hasPoints = typeof t.points === "number" && isFinite(t.points);
    tiers.push({ id, name, color, points: hasPoints ? (t.points as number) : -1 });
  }
  if (tiers.length === 0) throw new Error("Invalid file: no tiers found.");
  // Assign position-based points (top = most) to any tier missing explicit points.
  tiers.forEach((t, i) => {
    if (t.points < 0) t.points = Math.max(0, tiers.length - i);
  });

  const itemsSource = board.items as Record<string, unknown>;
  const items: Record<string, TierItem> = {};
  for (const [id, raw] of Object.entries(itemsSource)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const type: ItemType =
      it.type === "image" ? "image" : "text";
    const label = typeof it.label === "string" ? it.label : "Untitled";
    const imageUrl =
      typeof it.imageUrl === "string" ? it.imageUrl : undefined;
    const assignedUserId =
      typeof it.assignedUserId === "string" ? it.assignedUserId : undefined;
    items[id] = {
      id,
      type,
      label,
      ...(imageUrl ? { imageUrl } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
    };
  }

  const tierItems: Record<string, string[]> = {};
  for (const t of tiers) tierItems[t.id] = [];
  const tierItemsSrc =
    (board.tierItems as Record<string, unknown> | undefined) ?? {};
  for (const t of tiers) {
    const arr = tierItemsSrc[t.id];
    if (Array.isArray(arr)) {
      tierItems[t.id] = arr.filter(
        (id) => typeof id === "string" && items[id]
      ) as string[];
    }
  }

  const unranked = Array.isArray(board.unranked)
    ? (board.unranked as unknown[]).filter(
        (id) => typeof id === "string" && items[id]
      ) as string[]
    : [];

  const bankedScores: Record<string, BankedScore> = {};
  const bankedSrc = board.bankedScores;
  if (bankedSrc && typeof bankedSrc === "object" && !Array.isArray(bankedSrc)) {
    for (const [id, raw] of Object.entries(bankedSrc as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const b = raw as Record<string, unknown>;
      const label =
        typeof b.label === "string"
          ? b.label
          : typeof b.name === "string"
            ? b.name
            : "Item";
      const imageUrl =
        typeof b.imageUrl === "string" ? b.imageUrl : undefined;
      const linkedPlayerName =
        typeof b.linkedPlayerName === "string"
          ? b.linkedPlayerName
          : typeof b.name === "string" && !b.label
            ? b.name
            : undefined;
      const linkedPlayerColor =
        typeof b.linkedPlayerColor === "string"
          ? b.linkedPlayerColor
          : typeof b.color === "string"
            ? b.color
            : undefined;
      const rounds =
        typeof b.rounds === "number" && isFinite(b.rounds) && b.rounds > 0
          ? b.rounds
          : 1;

      // New vote-based shape
      if (
        typeof b.tierId === "string" &&
        typeof b.tierName === "string" &&
        typeof b.tierColor === "string"
      ) {
        bankedScores[id] = {
          label,
          ...(imageUrl ? { imageUrl } : {}),
          ...(linkedPlayerName ? { linkedPlayerName } : {}),
          ...(linkedPlayerColor ? { linkedPlayerColor } : {}),
          tierId: b.tierId,
          tierName: b.tierName,
          tierColor: b.tierColor,
          lastVoteCount:
            typeof b.lastVoteCount === "number" && isFinite(b.lastVoteCount)
              ? b.lastVoteCount
              : 0,
          rounds,
        };
        continue;
      }

      // Legacy peer-rating → map letter tier to first matching board row
      const tierRaw = typeof b.tier === "string" ? b.tier.trim().toUpperCase() : "";
      const matched =
        tiers.find((t) => t.name.trim().toUpperCase() === tierRaw) ??
        tiers[0];
      if (!matched) continue;
      bankedScores[id] = {
        label,
        ...(imageUrl ? { imageUrl } : {}),
        ...(linkedPlayerName ? { linkedPlayerName } : {}),
        ...(linkedPlayerColor ? { linkedPlayerColor } : {}),
        tierId: matched.id,
        tierName: matched.name,
        tierColor: matched.color,
        lastVoteCount: 0,
        rounds,
      };
    }
  }

  return { title, description, tiers, items, tierItems, unranked, bankedScores };
}

/** Pick a readable text color (white/near-black) for a given hex background. */
export function readableTextOn(hex: string): string {
  const c = hex.replace("#", "");
  const full =
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a1a1f" : "#ffffff";
}
