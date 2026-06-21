"use client";

/** User presence as tracked by the server and broadcast to the room. */
export interface RoomUser {
  /** Ephemeral socket id — changes every reconnect. Used for vote voter strip. */
  id: string;
  /** Stable id from the client's localStorage — use for item assignment & scoring. */
  identityId: string;
  name: string;
  color: string;
  presence: "online" | "idle" | "dragging" | "voting";
  lastSeen: number;
}

export type ActivityAction =
  | "joined"
  | "left"
  | "added"
  | "moved"
  | "deleted"
  | "vote_started"
  | "voted"
  | "vote_ended"
  | "vote_cancelled"
  | "rating_started"
  | "rating_submitted"
  | "rating_ended"
  | "rating_cancelled";

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  detail: string;
  ts: number;
}

/** Human-readable label + icon hint for an activity action. */
export const ACTIVITY_META: Record<
  ActivityAction,
  { label: (name: string, detail: string) => string; tone: string }
> = {
  joined: {
    label: (n) => `${n} joined the room`,
    tone: "text-emerald-300",
  },
  left: {
    label: (n) => `${n} left`,
    tone: "text-muted-foreground",
  },
  added: {
    label: (n, d) => `${n} added ${d}`,
    tone: "text-sky-300",
  },
  moved: {
    label: (n, d) => `${n} moved ${d}`,
    tone: "text-violet-300",
  },
  deleted: {
    label: (n, d) => `${n} removed ${d}`,
    tone: "text-rose-300",
  },
  vote_started: {
    label: (n, d) => `${n} started a vote on ${d}`,
    tone: "text-amber-300",
  },
  voted: {
    label: (n, d) => `${n} voted ${d}`,
    tone: "text-amber-300",
  },
  vote_ended: {
    label: (n, d) => `${n} ended the vote — ${d}`,
    tone: "text-emerald-300",
  },
  vote_cancelled: {
    label: (n) => `${n} cancelled the vote`,
    tone: "text-muted-foreground",
  },
  rating_started: {
    label: (n) => `${n} started a rating round`,
    tone: "text-violet-300",
  },
  rating_submitted: {
    label: (n) => `${n} submitted ratings`,
    tone: "text-violet-300/80",
  },
  rating_ended: {
    label: (n) => `${n} closed the rating round`,
    tone: "text-emerald-300",
  },
  rating_cancelled: {
    label: (n) => `${n} cancelled the rating round`,
    tone: "text-muted-foreground",
  },
};

export function formatActivity(entry: ActivityEntry): string {
  return ACTIVITY_META[entry.action]?.label(entry.userName, entry.detail) ?? "";
}

/** Stable key for matching room members to assigned items / leaderboard rows. */
export function memberKey(member: Pick<RoomUser, "identityId" | "id">): string {
  return member.identityId || member.id;
}
