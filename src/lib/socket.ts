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
  socket = io(target, {
    path: "/",
    transports: ["polling", "websocket"],
    upgrade: true,
    rememberUpgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
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
