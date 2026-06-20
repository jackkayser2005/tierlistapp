"use client";

import { io, type Socket } from "socket.io-client";

/**
 * Shared socket.io singleton. Both useMultiplayer and useVoting attach
 * listeners to this one connection so we never open two sockets.
 *
 * In production, set NEXT_PUBLIC_ROOM_SERVICE_URL to your hosted backend
 * (e.g. https://rankforge-room.onrender.com). In local dev, it falls back
 * to the Caddy gateway via the XTransformPort query param.
 */

let socket: Socket | null = null;

export function ensureSocket(): Socket {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_ROOM_SERVICE_URL || null;
  const target = url ?? "/?XTransformPort=3003";

  // Transport selection:
  //  - Production (NEXT_PUBLIC_ROOM_SERVICE_URL set) is a DIRECT connection to
  //    the hosted room service, so we go websocket-first for the lowest latency
  //    (no long-polling round-trips). We keep polling as a fallback for
  //    networks/proxies that block raw WS.
  //  - Local dev goes through the Caddy gateway, which historically does not
  //    forward the WS upgrade reliably, so we connect polling-first and let
  //    socket.io upgrade to websocket opportunistically.
  const isDirect = !!url;
  socket = io(target, {
    path: "/",
    transports: isDirect ? ["websocket", "polling"] : ["polling", "websocket"],
    upgrade: true,
    rememberUpgrade: isDirect,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 12000,
  });
  return socket;
}

export function destroySocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
