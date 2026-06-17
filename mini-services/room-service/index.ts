/**
 * RankForge Room Service
 * ----------------------
 * A standalone socket.io mini-service that powers real-time collaboration
 * on a shared RankForge tier-list board. Multiple clients join the same
 * short room code (e.g. "ABC123") and broadcast board changes to each other.
 *
 * Runs on a FIXED port 3003. The Next.js frontend connects via the Caddy
 * gateway using `io("/?XTransformPort=3003")` — the gateway forwards
 * based on that query param, so we just bind :3003 and accept all origins.
 *
 * State is in-memory only (no database). Rooms are dropped on restart.
 */

import { createServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of a board payload — we treat it as an opaque JSON object. */
type Board = Record<string, unknown> | null

interface RoomState {
  /** socket ids currently in the room */
  members: Set<string>
  /** socket id of the room host (first joiner); stays until disconnect */
  host: string | null
  /** latest board snapshot so late joiners can hydrate immediately */
  board: Board
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/** Map of roomId -> RoomState. No persistence; cleared on restart. */
const rooms = new Map<string, RoomState>()

/**
 * Reverse index: socket id -> Set<roomId>. Lets us clean up efficiently on
 * disconnect without scanning every room.
 */
const socketRooms = new Map<string, Set<string>>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get-or-create a RoomState for a given room id. */
function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId)
  if (!room) {
    room = { members: new Set<string>(), host: null, board: null }
    rooms.set(roomId, room)
  }
  return room
}

/** Number of peers currently connected to a room (0 if room does not exist). */
function peerCount(roomId: string): number {
  return rooms.get(roomId)?.members.size ?? 0
}

/** Track which rooms a socket has joined (for fast disconnect cleanup). */
function rememberRoom(socketId: string, roomId: string): void {
  let set = socketRooms.get(socketId)
  if (!set) {
    set = new Set<string>()
    socketRooms.set(socketId, set)
  }
  set.add(roomId)
}

/** Remove a socket from a room and clean up the reverse index. */
function forgetRoom(socketId: string, roomId: string): void {
  const room = rooms.get(roomId)
  if (room) {
    room.members.delete(socketId)
    // If the host left, promote any remaining member (deterministic: lowest id).
    if (room.host === socketId) {
      const next = room.members.size > 0
        ? Array.from(room.members).sort()[0]
        : null
      room.host = next
    }
    // If empty, we keep the snapshot in memory so a quick reconnect restores
    // state. The room Map entry stays around; that's fine for a mini-service.
  }
  socketRooms.get(socketId)?.delete(roomId)
}

// ---------------------------------------------------------------------------
// HTTP + Socket.IO server
// ---------------------------------------------------------------------------

// NOTE: we intentionally do NOT register a custom HTTP request handler here.
// socket.io is configured with `path: '/'` below (required by the Caddy
// gateway routing), which means engine.io owns every HTTP request to this
// server. A custom /health route would be shadowed by engine.io, so we keep
// the server bare and rely on socket.io's own handshake for liveness.
const httpServer = createServer()

const io = new Server(httpServer, {
  // The Caddy gateway routes by path '/' + XTransformPort query param,
  // so the socket.io path MUST be '/' to match the default.
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`)

  // ----- room:join -------------------------------------------------------
  // Client joins (or creates) a room. Optionally carries a board snapshot
  // (useful when the creator wants to seed the room with an existing tier list).
  socket.on('room:join', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; board?: Board }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) {
        socket.emit('room:error', { event: 'room:join', message: 'roomId is required' })
        return
      }

      // Leave any rooms this socket was previously in (a socket is in one
      // RankForge room at a time).
      const previous = socketRooms.get(socket.id)
      if (previous && previous.size > 0) {
        for (const oldRoomId of previous) {
          socket.leave(oldRoomId)
          forgetRoom(socket.id, oldRoomId)
          io.to(oldRoomId).emit('presence:update', {
            roomId: oldRoomId,
            peers: peerCount(oldRoomId),
          })
        }
      }

      const room = getOrCreateRoom(roomId)
      const wasNew = room.members.size === 0

      socket.join(roomId)
      room.members.add(socket.id)
      rememberRoom(socket.id, roomId)

      // First joiner becomes host.
      if (wasNew || room.host === null) {
        room.host = socket.id
      }

      // Update the stored snapshot if the client provided a board.
      if (data.board !== undefined && data.board !== null) {
        room.board = data.board
      }

      const isHost = room.host === socket.id

      // Send full state to the joiner (including current board, if any).
      socket.emit('room:state', {
        roomId,
        isHost,
        peers: room.members.size,
        board: room.board,
      })

      // Tell everyone (including sender) the new peer count.
      io.to(roomId).emit('presence:update', {
        roomId,
        peers: room.members.size,
      })

      console.log(`[room:join] ${socket.id} -> ${roomId} (peers=${room.members.size}, host=${isHost})`)
    } catch (err) {
      console.error(`[room:join] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'room:join', message: 'internal error' })
    }
  })

  // ----- board:update ----------------------------------------------------
  // A client changed its local board and wants to broadcast to peers.
  // We store the snapshot AND relay to everyone else (NOT back to sender,
  // since the sender already has the optimistic local state).
  socket.on('board:update', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; board?: Board }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      if (!roomId || data.board === undefined || data.board === null) {
        return
      }

      const room = rooms.get(roomId)
      if (!room) {
        // No room yet — create on the fly so the snapshot isn't lost.
        getOrCreateRoom(roomId).board = data.board
      } else {
        room.board = data.board
      }

      // Relay to every other peer in the room.
      socket.to(roomId).emit('board:update', { board: data.board })
    } catch (err) {
      console.error(`[board:update] error from ${socket.id}:`, err)
    }
  })

  // ----- board:sync-request ---------------------------------------------
  // A freshly-joined client asks for the current board. We reply directly
  // to the requester with whatever snapshot we have (or null if none).
  socket.on('board:sync-request', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      const room = roomId ? rooms.get(roomId) : undefined

      socket.emit('board:sync', {
        roomId,
        board: room ? room.board : null,
      })
    } catch (err) {
      console.error(`[board:sync-request] error from ${socket.id}:`, err)
    }
  })

  // ----- disconnect ------------------------------------------------------
  socket.on('disconnect', (reason: string) => {
    try {
      const joined = socketRooms.get(socket.id)
      if (joined) {
        for (const roomId of joined) {
          forgetRoom(socket.id, roomId)
          socket.leave(roomId)
          // Notify remaining peers of the new count.
          io.to(roomId).emit('presence:update', {
            roomId,
            peers: peerCount(roomId),
          })
        }
        socketRooms.delete(socket.id)
      }
      console.log(`[disconnect] ${socket.id} (${reason})`)
    } catch (err) {
      console.error(`[disconnect] error from ${socket.id}:`, err)
    }
  })

  socket.on('error', (err: Error) => {
    console.error(`[socket-error] ${socket.id}:`, err)
  })
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`room-service on :${PORT}`)
})

// Graceful shutdown so `bun --hot` restarts don't leave dangling sockets.
function shutdown(signal: string): void {
  console.log(`[${signal}] shutting down room-service...`)
  io.close(() => {
    httpServer.close(() => {
      console.log('room-service closed')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
