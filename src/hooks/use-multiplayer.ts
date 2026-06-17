"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { useRankForge } from "@/lib/store";
import { normalizeBoard, UNRANKED_ID, type RankForgeBoard } from "@/lib/tierlist";
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
  // 5-char base32-ish code, unambiguous chars only.
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

export function useMultiplayer() {
  const [state, setState] = React.useState<MultiplayerState>({
    status: "disconnected",
    roomId: null,
    isHost: false,
    peers: 0,
  });

  const socketRef = React.useRef<Socket | null>(null);
  // Suppress flag: when applying a remote board, we must not rebroadcast it.
  const suppressBroadcastRef = React.useRef(false);
  // Track the last broadcasted signature to avoid redundant emits.
  const lastSigRef = React.useRef<string>("");
  const pendingJoinRef = React.useRef<{ roomId: string; asHost: boolean } | null>(null);
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
    const sock = io("/?XTransformPort=3003", {
      path: "/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    });
    socketRef.current = sock;
    return sock;
  }, []);

  const handleState = React.useCallback((payload: ServerRoomState) => {
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
        const board = normalizeBoard(payload.board);
        useRankForge.getState().loadBoard(board);
        lastSigRef.current = JSON.stringify(board);
      } catch {
        /* ignore malformed */
      }
    }
    // Release the suppress lock on the next tick so the loadBoard change
    // (which triggers the subscriber) doesn't get rebroadcast.
    setTimeout(() => {
      suppressBroadcastRef.current = false;
    }, 0);
  }, []);

  const joinRoom = React.useCallback(
    (roomId: string, asHost: boolean) => {
      const sock = connect();
      setState((s) => ({ ...s, status: "connecting" }));

      const onState = (payload: ServerRoomState) => {
        handleState(payload);
        if (asHost) {
          toast.success(`Room live — code ${payload.roomId}`);
        } else {
          toast.success(`Joined room ${payload.roomId}`);
        }
      };
      const onSync = (payload: { board: RankForgeBoard | null }) => {
        if (payload.board) {
          suppressBroadcastRef.current = true;
          try {
            const board = normalizeBoard(payload.board);
            useRankForge.getState().loadBoard(board);
            lastSigRef.current = JSON.stringify(board);
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            suppressBroadcastRef.current = false;
          }, 0);
        }
      };
      const onPresence = (payload: { roomId: string; peers: number }) => {
        setState((s) => ({ ...s, peers: payload.peers }));
      };

      sock.off("room:state").on("room:state", onState);
      sock.off("board:sync").on("board:sync", onSync);
      sock.off("presence:update").on("presence:update", onPresence);
      sock.off("board:update").on("board:update", (payload: { board: RankForgeBoard }) => {
        suppressBroadcastRef.current = true;
        try {
          const board = normalizeBoard(payload.board);
          useRankForge.getState().loadBoard(board);
          lastSigRef.current = JSON.stringify(board);
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          suppressBroadcastRef.current = false;
        }, 0);
      });

      const board = asHost ? snapshotBoard(useRankForge.getState()) : undefined;
      sock.emit("room:join", { roomId, board });
    },
    [connect, handleState]
  );

  const createRoom = React.useCallback(() => {
    const code = genRoomCode();
    joinRoom(code, true);
  }, [joinRoom]);

  const leaveRoom = React.useCallback(() => {
    const sock = socketRef.current;
    if (sock) {
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
    }
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
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ---- Auto-join from URL on first mount ----
  React.useEffect(() => {
    setHydrated(true);
    const room = getRoomFromUrl();
    if (room) {
      pendingJoinRef.current = { roomId: room, asHost: false };
      // Defer slightly so the toast provider is ready.
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

  return {
    ...state,
    hydrated,
    createRoom,
    joinRoom,
    leaveRoom,
    copyShareLink,
    shareUrl,
  };
}
