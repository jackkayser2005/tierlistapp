"use client";

import { io, type Socket } from "socket.io-client";

/**
 * Shared socket.io singleton. Both useMultiplayer and useVoting attach
 * listeners to this one connection so we never open two sockets.
 */

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function ensureSocket(): Socket {
  if (socket) return socket;
  if (connecting) {
    // Another caller is mid-connect; return a placeholder that resolves.
    // In practice this is rare because we always await before use.
  }
  socket = io("/?XTransformPort=3003", {
    path: "/",
    transports: ["websocket", "polling"],
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
  connecting = null;
}
