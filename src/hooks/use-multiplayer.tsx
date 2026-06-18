"use client";

import * as React from "react";
import { useRankForge } from "@/lib/store";
import { normalizeBoard, type RankForgeBoard } from "@/lib/tierlist";
import { ensureSocket, destroySocket, getSocket } from "@/lib/socket";
import { toast } from "sonner";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface MultiplayerState {
  status: ConnectionStatus;
  roomId: string | null;
  isHost: boolean;
  peers: number;
}

interface ServerRoomState {
  roomId: string;
  isHost: boolean;
  peers: number;
  board: RankForgeBoard | null;
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

interface MultiplayerContextValue extends MultiplayerState {
  hydrated: boolean;
  createRoom: () => void;
  joinRoom: (roomId: string, asHost: boolean) => void;
  leaveRoom: () => void;
  copyShareLink: () => Promise<void>;
  shareUrl: string | null;
}

const MultiplayerContext = React.createContext<MultiplayerContextValue>({
  status: "disconnected",
  roomId: null,
  isHost: false,
  peers: 0,
  hydrated: false,
  createRoom: () => {},
  joinRoom: () => {},
  leaveRoom: () => {},
  copyShareLink: async () => {},
  shareUrl: null,
});

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<MultiplayerState>({
    status: "disconnected",
    roomId: null,
    isHost: false,
    peers: 0,
  });

  const socketRef = React.useRef<Socket | null>(null);
  const suppressBroadcastRef = React.useRef(false);
  const lastSigRef = React.useRef<string>("");
  const [hydrated, setHydrated] = React.useState(false);

  // ---- Subscribe to local store changes and broadcast (when connected) ----
  React.useEffect(() => {
    if (state.status !== "connected" || !state.roomId) return;
    const unsub = useRankForge.subscribe((s) => {
      if (suppressBroadcastRef.current) return;
      const board = snapshotBoard(s);
      const sig = JSON.stringify(board);
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      socketRef.current?.emit("board:update", { roomId: state.roomId, board });
    });
    return unsub;
  }, [state.status, state.roomId]);

  const connect = React.useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const sock = ensureSocket();
    socketRef.current = sock;
    return sock;
  }, []);

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

  const handleState = React.useCallback(
    (payload: ServerRoomState, asHost: boolean) => {
      suppressBroadcastRef.current = true;
      setState({
        status: "connected",
        roomId: payload.roomId,
        isHost: payload.isHost,
        peers: payload.peers,
      });
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
      sock.off("presence:update").on("presence:update", (payload: { roomId: string; peers: number }) => {
        setState((s) => ({ ...s, peers: payload.peers }));
      });
      sock.off("board:update").on("board:update", (payload: { board: RankForgeBoard }) => {
        applyRemoteBoard(payload.board);
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
    setState({
      status: "disconnected",
      roomId: null,
      isHost: false,
      peers: 0,
    });
    toast("Left the room");
  }, []);

  // ---- Cleanup on unmount ----
  React.useEffect(() => {
    return () => {
      const sock = getSocket();
      sock?.removeAllListeners();
    };
  }, []);

  // ---- Auto-join from URL on first mount ----
  React.useEffect(() => {
    setHydrated(true);
    const room = getRoomFromUrl();
    if (room) {
      const t = setTimeout(() => joinRoom(room, false), 200);
      return () => clearTimeout(t);
    }
  }, [joinRoom]);

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
        description: "Send it to a friend to rank together.",
      });
    } catch {
      toast.error("Couldn't copy the link");
    }
  }, [shareUrl]);

  const value = React.useMemo<MultiplayerContextValue>(
    () => ({
      ...state,
      hydrated,
      createRoom,
      joinRoom,
      leaveRoom,
      copyShareLink,
      shareUrl,
    }),
    [state, hydrated, createRoom, joinRoom, leaveRoom, copyShareLink, shareUrl]
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
