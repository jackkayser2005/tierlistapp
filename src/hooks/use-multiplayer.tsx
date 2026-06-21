"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { normalizeBoard, type RankForgeBoard } from "@/lib/tierlist";
import { ensureSocket, destroySocket, getSocket } from "@/lib/socket";
import { getLocalUser, saveLocalUser, type LocalUser } from "@/lib/identity";
import type { RoomUser, ActivityEntry, ActivityAction } from "@/lib/presence";
import { toast } from "sonner";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type PresenceState = "online" | "idle" | "dragging" | "voting";

export interface FocusInfo {
  userId: string;
  userName: string;
  userColor: string;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Focus external store
// ---------------------------------------------------------------------------
// Focus highlights are high-churn and item-scoped. Rather than storing them in
// React context (which would re-render EVERY card on each focus change), we keep
// them in a tiny external store and let each card subscribe to ONLY its own item
// via useSyncExternalStore. With many users this avoids O(N) re-renders.

type FocusListener = () => void;
const focusStore = {
  map: {} as Record<string, FocusInfo>,
  listeners: new Set<FocusListener>(),
  timers: {} as Record<string, ReturnType<typeof setTimeout>>,
};

function emitFocus() {
  for (const l of focusStore.listeners) l();
}

function setItemFocus(info: FocusInfo) {
  focusStore.map = { ...focusStore.map, [info.itemId]: info };
  if (focusStore.timers[info.itemId]) clearTimeout(focusStore.timers[info.itemId]);
  focusStore.timers[info.itemId] = setTimeout(() => {
    removeItemFocus(info.itemId);
  }, 4500);
  emitFocus();
}

function removeItemFocus(itemId: string) {
  if (!focusStore.map[itemId]) return;
  const next = { ...focusStore.map };
  delete next[itemId];
  focusStore.map = next;
  if (focusStore.timers[itemId]) {
    clearTimeout(focusStore.timers[itemId]);
    delete focusStore.timers[itemId];
  }
  emitFocus();
}

function removeUserFocus(userId: string) {
  let changed = false;
  const next = { ...focusStore.map };
  for (const k of Object.keys(next)) {
    if (next[k].userId === userId) {
      delete next[k];
      if (focusStore.timers[k]) {
        clearTimeout(focusStore.timers[k]);
        delete focusStore.timers[k];
      }
      changed = true;
    }
  }
  if (changed) {
    focusStore.map = next;
    emitFocus();
  }
}

function clearAllFocus() {
  for (const k of Object.keys(focusStore.timers)) clearTimeout(focusStore.timers[k]);
  focusStore.timers = {};
  if (Object.keys(focusStore.map).length === 0) return;
  focusStore.map = {};
  emitFocus();
}

function subscribeFocus(cb: FocusListener) {
  focusStore.listeners.add(cb);
  return () => focusStore.listeners.delete(cb);
}

/** Subscribe to the focus highlight for a single item only. Cheap at scale. */
export function useItemFocus(itemId: string): FocusInfo | undefined {
  const getSnapshot = React.useCallback(() => focusStore.map[itemId], [itemId]);
  return React.useSyncExternalStore(subscribeFocus, getSnapshot, () => undefined);
}

export interface MultiplayerState {
  status: ConnectionStatus;
  roomId: string | null;
  isHost: boolean;
  peers: number;
  members: RoomUser[];
  hostId: string | null;
}

interface ServerRoomState {
  roomId: string;
  isHost: boolean;
  peers: number;
  board: RankForgeBoard | null;
  seq?: number;
}

const ROOM_PARAM = "room";

function genRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(5);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 5; i++) arr[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < 5; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function getRoomFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(ROOM_PARAM);
}

function setRoomInUrl(roomId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (roomId) url.searchParams.set(ROOM_PARAM, roomId);
  else url.searchParams.delete(ROOM_PARAM);
  window.history.replaceState({}, "", url.toString());
}

function snapshotBoard(state: ReturnType<typeof useRankForge.getState>): RankForgeBoard {
  return {
    title: state.title,
    description: state.description,
    tiers: state.tiers,
    items: state.items,
    tierItems: state.tierItems,
    unranked: state.unranked,
    bankedScores: state.bankedScores,
  };
}

let eventCounter = 0;
function nextEventId(): string {
  eventCounter += 1;
  return `evt_${Date.now()}_${eventCounter}`;
}

interface MultiplayerContextValue extends MultiplayerState {
  hydrated: boolean;
  user: LocalUser;
  /** Everyone an item can be assigned to. Always includes the local user, even
   * offline, so the points/leaderboard feature works in solo mode too. */
  assignableMembers: RoomUser[];
  /** Whether this client may edit the board. True when solo (not in a room) or
   * when host. Guests in a room can watch & vote but not edit. */
  canEdit: boolean;
  updateUser: (patch: Partial<LocalUser>) => void;
  createRoom: () => void;
  joinRoom: (roomId: string, asHost: boolean) => void;
  leaveRoom: () => void;
  copyShareLink: () => Promise<void>;
  shareUrl: string | null;
  setPresence: (state: PresenceState) => void;
  logActivity: (action: ActivityAction, detail: string) => void;
  setFocus: (itemId: string) => void;
  clearFocus: () => void;
  /** Apply a store mutation without broadcasting to the room (for guest vote placement). */
  applySilentUpdate: (fn: () => void) => void;
}

const MultiplayerContext = React.createContext<MultiplayerContextValue>({
  status: "disconnected",
  roomId: null,
  isHost: false,
  peers: 0,
  members: [],
  hostId: null,
  hydrated: false,
  user: { id: "", name: "Guest", color: "#64748b" },
  assignableMembers: [],
  canEdit: true,
  updateUser: () => {},
  createRoom: () => {},
  joinRoom: () => {},
  leaveRoom: () => {},
  copyShareLink: async () => {},
  shareUrl: null,
  setPresence: () => {},
  logActivity: () => {},
  setFocus: () => {},
  clearFocus: () => {},
  applySilentUpdate: (fn) => fn(),
});

// Activity lives in its own context so the (frequent) activity feed updates only
// re-render the feed — not the entire board.
const ActivityContext = React.createContext<ActivityEntry[]>([]);

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<MultiplayerState>({
    status: "disconnected",
    roomId: null,
    isHost: false,
    peers: 0,
    members: [],
    hostId: null,
  });
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);

  const [user, setUser] = React.useState<LocalUser>({
    id: "",
    name: "Guest",
    color: "#64748b",
  });
  const [hydrated, setHydrated] = React.useState(false);

  const socketRef = React.useRef<ReturnType<typeof ensureSocket> | null>(null);
  const suppressBroadcastRef = React.useRef(false);
  const lastSigRef = React.useRef<string>("");
  const lastPresenceRef = React.useRef<PresenceState>("online");
  const presenceThrottleRef = React.useRef<number>(0);
  const heartbeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const boardEmitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBoardRef = React.useRef<RankForgeBoard | null>(null);
  // eventIds we've sent recently, so an echoed board:update is ignored cheaply.
  const sentEventIdsRef = React.useRef<Set<string>>(new Set());

  // ---- Hydrate local user identity on mount ----
  React.useEffect(() => {
    setUser(getLocalUser());
    setHydrated(true);
  }, []);

  const applySilentUpdate = React.useCallback((fn: () => void) => {
    suppressBroadcastRef.current = true;
    fn();
    setTimeout(() => {
      suppressBroadcastRef.current = false;
    }, 0);
  }, []);

  const emitIdentity = React.useCallback((u: LocalUser) => {
    const sock = getSocket();
    if (sock && u.name && u.color) {
      sock.emit("identity", {
        identityId: u.id,
        name: u.name,
        color: u.color,
      });
    }
  }, []);

  const updateUser = React.useCallback(
    (patch: Partial<LocalUser>) => {
      setUser((prev) => {
        const next = { ...prev, ...patch };
        saveLocalUser(next);
        emitIdentity(next);
        return next;
      });
    },
    [emitIdentity]
  );

  // ---- Apply a remote board snapshot (suppresses rebroadcast) ----
  // Cheap: if the incoming board matches what we already have, do nothing — no
  // store write, no re-render. This makes redundant board:update relays free.
  const applyRemoteBoard = React.useCallback((board: RankForgeBoard) => {
    let normalized: RankForgeBoard;
    try {
      normalized = normalizeBoard(board);
    } catch {
      return; /* ignore malformed */
    }
    const sig = JSON.stringify(normalized);
    if (sig === lastSigRef.current) return; // identical to current state
    suppressBroadcastRef.current = true;
    lastSigRef.current = sig;
    useRankForge.getState().loadBoard(normalized);
    setTimeout(() => {
      suppressBroadcastRef.current = false;
    }, 0);
  }, []);

  // ---- Throttled board broadcast (debounce 140ms, signature-deduped) ----
  const scheduleBoardEmit = React.useCallback((roomId: string) => {
    pendingBoardRef.current = snapshotBoard(useRankForge.getState());
    if (boardEmitTimerRef.current) return;
    boardEmitTimerRef.current = setTimeout(() => {
      boardEmitTimerRef.current = null;
      const board = pendingBoardRef.current;
      pendingBoardRef.current = null;
      if (!board) return;
      const sig = JSON.stringify(board);
      if (sig === lastSigRef.current) return; // nothing actually changed
      lastSigRef.current = sig;
      const eventId = nextEventId();
      const sent = sentEventIdsRef.current;
      sent.add(eventId);
      if (sent.size > 32) {
        // keep the set bounded
        const first = sent.values().next().value;
        if (first) sent.delete(first);
      }
      socketRef.current?.emit("board:update", { roomId, board, eventId });
    }, 140);
  }, []);

  // ---- Subscribe to local store changes and broadcast (when connected) ----
  React.useEffect(() => {
    if (state.status !== "connected" || !state.roomId) return;
    const roomId = state.roomId;
    const unsub = useRankForge.subscribe(() => {
      if (suppressBroadcastRef.current) return;
      scheduleBoardEmit(roomId);
    });
    return unsub;
  }, [state.status, state.roomId, scheduleBoardEmit]);

  // ---- Heartbeat ----
  React.useEffect(() => {
    if (state.status !== "connected") return;
    const beat = () => {
      const sock = getSocket();
      if (sock && sock.connected) sock.emit("heartbeat");
    };
    beat();
    heartbeatRef.current = setInterval(beat, 20000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [state.status]);

  const connect = React.useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const sock = ensureSocket();
    socketRef.current = sock;

    const u = getLocalUser();
    emitIdentity(u);

    sock.off("disconnect").on("disconnect", () => {
      setState((s) => (s.status === "connected" ? { ...s, status: "connecting" } : s));
    });

    sock.io.off("reconnect").on("reconnect", () => {
      emitIdentity(getLocalUser());
      const currentRoom = getRoomFromUrl();
      if (currentRoom) {
        sock.emit("room:join", { roomId: currentRoom });
        sock.emit("vote:sync-request", { roomId: currentRoom });
        sock.emit("rating:sync-request", { roomId: currentRoom });
      }
    });

    return sock;
  }, [emitIdentity]);

  const handleState = React.useCallback(
    (payload: ServerRoomState, asHost: boolean) => {
      suppressBroadcastRef.current = true;
      setState((s) => ({
        ...s,
        status: "connected",
        roomId: payload.roomId,
        isHost: payload.isHost,
        peers: payload.peers,
      }));
      setRoomInUrl(payload.roomId);
      if (payload.board) {
        try {
          const normalized = normalizeBoard(payload.board);
          useRankForge.getState().loadBoard(normalized);
          lastSigRef.current = JSON.stringify(normalized);
        } catch {
          /* ignore malformed */
        }
      }
      setTimeout(() => {
        suppressBroadcastRef.current = false;
      }, 0);
      if (asHost) {
        toast.success(`Room live — code ${payload.roomId}`);
      } else {
        toast.success(`Joined room ${payload.roomId}`);
      }
    },
    []
  );

  const joinRoom = React.useCallback(
    (roomId: string, asHost: boolean) => {
      const sock = connect();
      setState((s) => ({ ...s, status: "connecting" }));

      sock.off("room:state").on("room:state", (payload: ServerRoomState) => {
        handleState(payload, asHost);
      });
      sock.off("board:sync").on("board:sync", (payload: { board: RankForgeBoard | null }) => {
        if (payload.board) applyRemoteBoard(payload.board);
      });
      sock
        .off("board:update")
        .on("board:update", (payload: { board: RankForgeBoard; eventId?: string }) => {
          // Skip our own echo (defensive — server doesn't self-echo).
          if (payload.eventId && sentEventIdsRef.current.has(payload.eventId)) return;
          applyRemoteBoard(payload.board);
        });
      sock.off("presence:update").on(
        "presence:update",
        (payload: {
          members: Array<RoomUser & { identityId?: string }>;
          host: string | null;
          peers?: number;
        }) => {
          const s2 = getSocket();
          const myId = s2?.id ?? null;
          const members: RoomUser[] = (payload.members ?? []).map((m) => ({
            ...m,
            identityId: m.identityId ?? m.id,
          }));
          setState((s) => ({
            ...s,
            members,
            hostId: payload.host ?? null,
            isHost: payload.host != null ? payload.host === myId : s.isHost,
            peers: payload.peers ?? members.length,
          }));
        }
      );
      sock.off("activity:sync").on("activity:sync", (payload: { entries: ActivityEntry[] }) => {
        setActivity(payload.entries ?? []);
      });
      sock.off("activity:new").on("activity:new", (payload: { entry: ActivityEntry }) => {
        setActivity((prev) => {
          const next = [...prev, payload.entry];
          if (next.length > 40) next.splice(0, next.length - 40);
          return next;
        });
      });
      // Focus relay — routed to the external focus store (not React state).
      sock.off("focus:set").on("focus:set", (payload: FocusInfo) => {
        if (!payload?.itemId || !payload?.userId) return;
        setItemFocus(payload);
      });
      sock.off("focus:clear").on("focus:clear", (payload: { userId: string }) => {
        if (!payload?.userId) return;
        removeUserFocus(payload.userId);
      });

      const board = asHost ? snapshotBoard(useRankForge.getState()) : undefined;
      sock.emit("room:join", { roomId, board });
      sock.emit("vote:sync-request", { roomId });
      sock.emit("rating:sync-request", { roomId });
    },
    [connect, handleState, applyRemoteBoard]
  );

  const createRoom = React.useCallback(() => {
    const code = genRoomCode();
    joinRoom(code, true);
  }, [joinRoom]);

  const leaveRoom = React.useCallback(() => {
    const sock = socketRef.current;
    if (sock) {
      sock.removeAllListeners();
      socketRef.current = null;
    }
    destroySocket();
    setRoomInUrl(null);
    lastSigRef.current = "";
    lastPresenceRef.current = "online";
    clearAllFocus();
    setActivity([]);
    setState({
      status: "disconnected",
      roomId: null,
      isHost: false,
      peers: 0,
      members: [],
      hostId: null,
    });
    toast("Left the room");
  }, []);

  // ---- Presence (throttled to 400ms) ----
  const setPresence = React.useCallback((p: PresenceState) => {
    if (p === lastPresenceRef.current) return;
    lastPresenceRef.current = p;
    const now = Date.now();
    if (now - presenceThrottleRef.current < 400) return;
    presenceThrottleRef.current = now;
    const sock = getSocket();
    const roomId = getRoomFromUrl();
    if (sock && roomId) sock.emit("presence:set", { roomId, state: p });
  }, []);

  // ---- Activity logging ----
  const logActivity = React.useCallback((action: ActivityAction, detail: string) => {
    const sock = getSocket();
    const roomId = getRoomFromUrl();
    if (sock && roomId) {
      sock.emit("activity:log", { roomId, action, detail: detail.slice(0, 120) });
    }
  }, []);

  // ---- Focus (throttled, ephemeral) ----
  const lastFocusRef = React.useRef<string>("");
  const focusThrottleRef = React.useRef<number>(0);
  const setFocus = React.useCallback((itemId: string) => {
    if (itemId === lastFocusRef.current) return;
    lastFocusRef.current = itemId;
    const now = Date.now();
    if (now - focusThrottleRef.current < 250) return;
    focusThrottleRef.current = now;
    const sock = getSocket();
    const roomId = getRoomFromUrl();
    if (sock && roomId) sock.emit("focus:set", { roomId, itemId });
  }, []);
  const clearFocus = React.useCallback(() => {
    if (!lastFocusRef.current) return;
    lastFocusRef.current = "";
    const sock = getSocket();
    const roomId = getRoomFromUrl();
    if (sock && roomId) sock.emit("focus:clear", { roomId });
  }, []);

  // ---- Cleanup on unmount ----
  React.useEffect(() => {
    return () => {
      const sock = getSocket();
      sock?.removeAllListeners();
      if (boardEmitTimerRef.current) clearTimeout(boardEmitTimerRef.current);
      clearAllFocus();
    };
  }, []);

  // ---- Auto-join from URL on first mount ----
  React.useEffect(() => {
    if (!hydrated) return;
    const room = getRoomFromUrl();
    if (room) {
      const t = setTimeout(() => joinRoom(room, false), 200);
      return () => clearTimeout(t);
    }
  }, [hydrated, joinRoom]);

  const shareUrl = React.useMemo(() => {
    if (typeof window === "undefined" || !state.roomId) return null;
    const url = new URL(window.location.href);
    url.searchParams.set(ROOM_PARAM, state.roomId);
    return url.toString();
  }, [state.roomId]);

  const copyShareLink = React.useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied", {
        description: "Send it to up to 9 friends.",
      });
    } catch {
      toast.error("Couldn't copy the link");
    }
  }, [shareUrl]);

  // Everyone assignable: room members when connected, otherwise just the local
  // user so the points feature still works solo.
  const assignableMembers = React.useMemo<RoomUser[]>(() => {
    const selfAsMember: RoomUser = {
      id: user.id,
      identityId: user.id,
      name: user.name,
      color: user.color,
      presence: "online",
      lastSeen: Date.now(),
    };
    if (state.members.length === 0) return user.id ? [selfAsMember] : [];
    const hasSelf = state.members.some(
      (m) => m.identityId === user.id || m.id === user.id
    );
    return hasSelf ? state.members : [...state.members, selfAsMember];
  }, [state.members, user.id, user.name, user.color]);

  // Guests in a room can watch & vote, but only the host (or a solo user) edits.
  const canEdit = state.status !== "connected" || state.isHost;

  const value = React.useMemo<MultiplayerContextValue>(
    () => ({
      ...state,
      hydrated,
      user,
      assignableMembers,
      canEdit,
      updateUser,
      createRoom,
      joinRoom,
      leaveRoom,
      copyShareLink,
      shareUrl,
      setPresence,
      logActivity,
      setFocus,
      clearFocus,
      applySilentUpdate,
    }),
    [state, hydrated, user, assignableMembers, canEdit, updateUser, createRoom, joinRoom, leaveRoom, copyShareLink, shareUrl, setPresence, logActivity, setFocus, clearFocus, applySilentUpdate]
  );

  return (
    <MultiplayerContext.Provider value={value}>
      <ActivityContext.Provider value={activity}>{children}</ActivityContext.Provider>
    </MultiplayerContext.Provider>
  );
}

/** Consume the shared multiplayer state. Must be used inside MultiplayerProvider. */
export function useMultiplayer() {
  return React.useContext(MultiplayerContext);
}

/** Consume just the activity log (isolated so the feed re-renders alone). */
export function useActivityLog() {
  return React.useContext(ActivityContext);
}
