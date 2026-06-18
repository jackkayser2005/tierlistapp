"use client";

/**
 * Local user identity — generated once, stored in localStorage, edited by
 * the user. Sent to the server on connect so presence/activity can show
 * names + colored avatars.
 */

export interface LocalUser {
  id: string;
  name: string;
  color: string;
}

const STORAGE_KEY = "rankforge-identity-v1";

const NAME_POOL = [
  "Shadow", "Comet", "Echo", "Nova", "Pixel", "Quartz", "Raven", "Sage",
  "Tempo", "Vortex", "Bolt", "Cipher", "Drift", "Frost", "Glow", "Halo",
  "Iris", "Jade", "Kite", "Lumen", "Onyx", "Prism", "Quill", "Rune",
  "Spark", "Tide", "Umber", "Vega", "Wisp", "Zephyr",
];

const COLOR_POOL = [
  "#f43f5e", "#fb7185", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generate(): LocalUser {
  return {
    id: genId(),
    name: pick(NAME_POOL) + " " + Math.floor(Math.random() * 100),
    color: pick(COLOR_POOL),
  };
}

export function getLocalUser(): LocalUser {
  if (typeof window === "undefined") return generate();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === "string" && typeof parsed.color === "string") {
        return { id: parsed.id || genId(), name: parsed.name, color: parsed.color };
      }
    }
  } catch {
    /* ignore */
  }
  const user = generate();
  saveLocalUser(user);
  return user;
}

export function saveLocalUser(user: LocalUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}
