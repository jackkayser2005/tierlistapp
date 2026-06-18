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
  ts: number;
}

export interface CursorInfo {
  userId: string;
  userName: string;
  userColor: string;
  x: number; // 0-100 viewport %
  y: number;
  ts: number;
}

export interface MultiplayerState {
  status: ConnectionStatus;
  roomId: string | null;
  isHost: boolean;
  peers: number;
  members: RoomUser[];
  hostId: string | null;
  activity: ActivityEntry[];
  focuses: Record<string, FocusInfo>; // itemId -> FocusInfo
  cursors: Record<string, CursorInfo>; // userId -> CursorInfo
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
  moveCursor: (x: number, y: number) => void;
}

const MultiplayerContext = React.createContext<MultiplayerContextValue>({
  status: "disconnected",
  roomId: null,
  isHost: false,
  peers: 0,
  members: [],
  hostId: null,
  activity: [],
  focuses: {},
  hydrated: false,
  user: { id: "", name: "Guest", color: "#64748b" },
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
  moveCursor: () => {},
});

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<MultiplayerState>({
    status: "disconnected",
    roomId: null,
    isHost: false,
    peers: 0,
    members: [],
    hostId: null,
    activity: [],
    focuses: {},
    cursors: {},
  });
  const focusTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cursorTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  // ---- Hydrate local user identity on mount ----
  React.useEffect(() => {
    setUser(getLocalUser());
    setHydrated(true);
  }, []);

  const updateUser = React.useCallback((patch: Partial<LocalUser>) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      saveLocalUser(next);
      // Re-send identity to server if connected.
      const sock = getSocket();
      if (sock && next.name && next.color) {
        sock.emit("identity", { name: next.name, color: next.color });
      }
      return next;
    });
  }, []);

  // ---- Apply a remote board snapshot (suppresses rebroadcast) ----
  const applyRemoteBoard = React.useCallback((board: RankForgeBoard) => {
    suppressBroadcastRef.current = true;
    try {
      const normalized = normalizeBoard(board);
      useRankForge.getState().loadBoard(normalized);
      lastSigRef.current = JSON.stringify(normalized);
    } catch {
      /* ignore malformed */
    }
    setTimeout(() => {
      suppressBroadcastRef.current = false;
    }, 0);
  }, []);

  // ---- Throttled board broadcast (debounce 120ms) ----
  // Instead of emitting on every store change, we debounce so rapid drags
  // don't flood the server. The last state within 120ms is sent.
  const scheduleBoardEmit = React.useCallback(
    (roomId: string) => {
      pendingBoardRef.current = snapshotBoard(useRankForge.getState());
      if (boardEmitTimerRef.current) return;
      boardEmitTimerRef.current = setTimeout(() => {
        boardEmitTimerRef.current = null;
        const board = pendingBoardRef.current;
        if (!board) return;
        const sig = JSON.stringify(board);
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;
        const eventId = nextEventId();
        socketRef.current?.emit("board:update", { roomId, board, eventId });
      }, 120);
    },
    []
  );

  // ---- Subscribe to local store changes and broadcast (when connected) ----
  React.useEffect(() => {
    if (state.status !== "connected" || !state.roomId) return;
    const unsub = useRankForge.subscribe((s) => {
      if (suppressBroadcastRef.current) return;
      scheduleBoardEmit(state.roomId!);
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

    // Send identity as soon as we connect (or reconnect).
    const u = getLocalUser();
    sock.emit("identity", { name: u.name, color: u.color });

    // Track connection state for UI feedback.
    sock.off("disconnect").on("disconnect", () => {
      setState((s) =>
        s.status === "connected"
          ? { ...s, status: "connecting" }
          : s
      );
    });

    // Reconnect handler — re-emit identity, then rejoin if we had a room.
    sock.io.off("reconnect").on("reconnect", () => {
      const u2 = getLocalUser();
      sock.emit("identity", { name: u2.name, color: u2.color });
      const currentRoom = getRoomFromUrl();
      if (currentRoom) {
        // Re-join without sending our board (server has the authoritative one).
        // Listeners are already attached from the original joinRoom call.
        sock.emit("room:join", { roomId: currentRoom });
        // Request fresh vote state in case a vote is active.
        sock.emit("vote:sync-request", { roomId: currentRoom });
      }
    });

    return sock;
  }, []);

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

      // Wire up all listeners (idempotent — .off().on() pattern).
      sock.off("room:state").on("room:state", (payload: ServerRoomState) => {
        handleState(payload, asHost);
      });
      sock.off("board:sync").on("board:sync", (payload: { board: RankForgeBoard | null }) => {
        if (payload.board) applyRemoteBoard(payload.board);
      });
      sock.off("board:update").on("board:update", (payload: { board: RankForgeBoard }) => {
        applyRemoteBoard(payload.board);
      });
      sock.off("presence:update").on(
        "presence:update",
        (payload: { members: RoomUser[]; host: string | null; peers?: number }) => {
          const sock = getSocket();
          const myId = sock?.id ?? null;
          setState((s) => ({
            ...s,
            members: payload.members ?? [],
            hostId: payload.host ?? null,
            isHost: payload.host != null ? payload.host === myId : s.isHost,
            peers: payload.peers ?? (payload.members?.length ?? 0),
          }));
        }
      );
      sock.off("activity:sync").on("activity:sync", (payload: { entries: ActivityEntry[] }) => {
        setState((s) => ({ ...s, activity: payload.entries ?? [] }));
      });
      sock.off("activity:new").on("activity:new", (payload: { entry: ActivityEntry }) => {
        setState((s) => {
          const next = [...s.activity, payload.entry];
          if (next.length > 40) next.splice(0, next.length - 40);
          return { ...s, activity: next };
        });
      });
      // Focus relay — other users hovering/dragging items.
      sock.off("focus:set").on("focus:set", (payload: FocusInfo) => {
        if (!payload?.itemId || !payload?.userId) return;
        setState((s) => ({
          ...s,
          focuses: { ...s.focuses, [payload.itemId]: payload },
        }));
        const key = payload.itemId;
        if (focusTimersRef.current[key]) clearTimeout(focusTimersRef.current[key]);
        focusTimersRef.current[key] = setTimeout(() => {
          setState((s) => {
            const next = { ...s.focuses };
            delete next[key];
            return { ...s, focuses: next };
          });
          delete focusTimersRef.current[key];
        }, 4000);
      });
      sock.off("focus:clear").on("focus:clear", (payload: { userId: string }) => {
        if (!payload?.userId) return;
        setState((s) => {
          const next = { ...s.focuses };
          for (const k of Object.keys(next)) {
            if (next[k].userId === payload.userId) delete next[k];
          }
          return { ...s, focuses: next };
        });
      });
      // Cursor relay — live mouse positions.
      sock.off("cursor:move").on("cursor:move", (payload: CursorInfo) => {
        if (!payload?.userId) return;
        setState((s) => ({
          ...s,
          cursors: { ...s.cursors, [payload.userId]: payload },
        }));
        // Auto-expire after 5s of no movement.
        const key = payload.userId;
        if (cursorTimersRef.current[key]) clearTimeout(cursorTimersRef.current[key]);
        cursorTimersRef.current[key] = setTimeout(() => {
          setState((s) => {
            const next = { ...s.cursors };
            delete next[key];
            return { ...s, cursors: next };
          });
          delete cursorTimersRef.current[key];
        }, 5000);
      });
      sock.off("cursor:clear").on("cursor:clear", (payload: { userId: string }) => {
        if (!payload?.userId) return;
        setState((s) => {
          const next = { ...s.cursors };
          delete next[payload.userId];
          return { ...s, cursors: next };
        });
      });

      const board = asHost ? snapshotBoard(useRankForge.getState()) : undefined;
      sock.emit("room:join", { roomId, board });
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
    setState({
      status: "disconnected",
      roomId: null,
      isHost: false,
      peers: 0,
      members: [],
      hostId: null,
      activity: [],
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

  // ---- Cursor broadcast (rAF-throttled) ----
  const cursorRafRef = React.useRef<number | null>(null);
  const cursorPendingRef = React.useRef<{ x: number; y: number } | null>(null);
  const sendCursor = React.useCallback(() => {
    cursorRafRef.current = null;
    const pending = cursorPendingRef.current;
    if (!pending) return;
    cursorPendingRef.current = null;
    const sock = getSocket();
    const roomId = getRoomFromUrl();
    if (sock && roomId) sock.emit("cursor:move", { roomId, x: pending.x, y: pending.y });
  }, []);
  const moveCursor = React.useCallback((x: number, y: number) => {
    cursorPendingRef.current = { x, y };
    if (cursorRafRef.current === null) {
      cursorRafRef.current = requestAnimationFrame(sendCursor);
    }
  }, [sendCursor]);

  // ---- Cleanup on unmount ----
  React.useEffect(() => {
    return () => {
      const sock = getSocket();
      sock?.removeAllListeners();
      if (boardEmitTimerRef.current) clearTimeout(boardEmitTimerRef.current);
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

  const value = React.useMemo<MultiplayerContextValue>(
    () => ({
      ...state,
      hydrated,
      user,
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
      moveCursor,
    }),
    [state, hydrated, user, updateUser, createRoom, joinRoom, leaveRoom, copyShareLink, shareUrl, setPresence, logActivity, setFocus, clearFocus, moveCursor]
  );

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

/** Consume the shared multiplayer state. Must be used inside MultiplayerProvider. */
export function useMultiplayer() {
  return React.useContext(MultiplayerContext);
}
