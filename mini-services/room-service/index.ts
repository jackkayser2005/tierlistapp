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

/** Active vote on a single item. `votes` maps voter socket id -> chosen tierId. */
interface VoteState {
  itemId: string
  item: Record<string, unknown>
  votes: Map<string, string> // socketId -> tierId
  startedBy: string // socket id of the host who started it
}

interface RoomState {
  /** socket ids currently in the room */
  members: Set<string>
  /** socket id of the room host (first joiner); stays until disconnect */
  host: string | null
  /** latest board snapshot so late joiners can hydrate immediately */
  board: Board
  /** active vote, if any; null when no vote is in progress */
  vote: VoteState | null
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
    room = { members: new Set<string>(), host: null, board: null, vote: null }
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

/** Build the vote:state payload to broadcast. tally is { tierId: count }. */
function voteStatePayload(room: RoomState): {
  active: boolean
  itemId: string | null
  item: Record<string, unknown> | null
  tally: Record<string, number>
  voterCount: number
  totalPeers: number
} {
  const vote = room.vote
  const tally: Record<string, number> = {}
  let voterCount = 0
  if (vote) {
    for (const tierId of vote.votes.values()) {
      tally[tierId] = (tally[tierId] ?? 0) + 1
      voterCount++
    }
  }
  return {
    active: !!vote,
    itemId: vote?.itemId ?? null,
    item: vote?.item ?? null,
    tally,
    voterCount,
    totalPeers: room.members.size,
  }
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

      // If a vote is currently active, send its state to the joiner so they
      // see the voting overlay immediately.
      if (room.vote) {
        socket.emit('vote:state', voteStatePayload(room))
      }

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

  // ----- vote:sync-request ----------------------------------------------
  // A freshly-joined (or reconnecting) client asks for the current vote state
  // so it can show the voting overlay if a vote is in progress. We reply
  // directly to the requester.
  socket.on('vote:sync-request', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      const room = roomId ? rooms.get(roomId) : undefined
      socket.emit('vote:state', room ? voteStatePayload(room) : { active: false, itemId: null, item: null, tally: {}, voterCount: 0, totalPeers: 0 })
    } catch (err) {
      console.error(`[vote:sync-request] error from ${socket.id}:`, err)
    }
  })

  // ----- vote:start ------------------------------------------------------
  // Host kicks off a vote on a specific item. The item "pops up" for everyone
  // in the room; each peer then casts one vote for a tier via `vote:cast`.
  socket.on('vote:start', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        itemId?: string
        item?: Record<string, unknown>
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const itemId = typeof data.itemId === 'string' ? data.itemId.trim() : ''
      if (!roomId || !itemId || typeof data.item !== 'object' || data.item === null || Array.isArray(data.item)) {
        socket.emit('room:error', {
          event: 'vote:start',
          message: 'roomId (string), itemId (string) and item (object) are required',
        })
        return
      }

      const room = rooms.get(roomId)
      if (!room) {
        socket.emit('room:error', { event: 'vote:start', message: 'room not found' })
        return
      }
      if (room.host !== socket.id) {
        socket.emit('room:error', { event: 'vote:start', message: 'only host can start a vote' })
        return
      }

      room.vote = {
        itemId,
        item: data.item,
        votes: new Map<string, string>(),
        startedBy: socket.id,
      }

      io.to(roomId).emit('vote:state', voteStatePayload(room))
      console.log(`[vote:start] ${socket.id} -> ${roomId} item=${itemId}`)
    } catch (err) {
      console.error(`[vote:start] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:start', message: 'internal error' })
    }
  })

  // ----- vote:cast --------------------------------------------------------
  // A peer casts (or re-casts) their vote for a tier on the active item.
  // Stale votes (wrong itemId / no active vote) are ignored silently.
  socket.on('vote:cast', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        itemId?: string
        tierId?: string
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const itemId = typeof data.itemId === 'string' ? data.itemId.trim() : ''
      const tierId = typeof data.tierId === 'string' ? data.tierId.trim() : ''
      if (!roomId || !itemId || !tierId) return

      const room = rooms.get(roomId)
      if (!room || !room.vote) return
      if (room.vote.itemId !== itemId) return // stale vote

      room.vote.votes.set(socket.id, tierId)
      io.to(roomId).emit('vote:state', voteStatePayload(room))
      console.log(`[vote:cast] ${socket.id} voted ${tierId} in ${roomId}`)
    } catch (err) {
      console.error(`[vote:cast] error from ${socket.id}:`, err)
    }
  })

  // ----- vote:end ---------------------------------------------------------
  // Host ends the active vote. Winner = tierId with the highest count; ties
  // broken by ascending alphabetical tierId (deterministic). If no votes were
  // cast, winner = null. Emits `vote:result` then a final inactive `vote:state`
  // so clients close the overlay.
  socket.on('vote:end', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room || !room.vote) return

      if (room.host !== socket.id) {
        socket.emit('room:error', { event: 'vote:end', message: 'only host can end a vote' })
        return
      }

      const vote = room.vote
      const tally: Record<string, number> = {}
      let winner: string | null = null
      let bestCount = -1
      // Iterating tierIds in sorted order gives deterministic tie-breaking:
      // the alphabetically-first tierId wins on a tie (strict > keeps the
      // earliest-seen leading candidate).
      const sortedTierIds = Array.from(vote.votes.values()).sort()
      for (const tierId of sortedTierIds) {
        const count = (tally[tierId] ?? 0) + 1
        tally[tierId] = count
        if (count > bestCount) {
          bestCount = count
          winner = tierId
        }
      }
      if (vote.votes.size === 0) winner = null

      io.to(roomId).emit('vote:result', {
        itemId: vote.itemId,
        tally,
        winner,
      })

      room.vote = null
      io.to(roomId).emit('vote:state', voteStatePayload(room))
      console.log(`[vote:end] ${socket.id} -> ${roomId} winner=${winner}`)
    } catch (err) {
      console.error(`[vote:end] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:end', message: 'internal error' })
    }
  })

  // ----- vote:cancel ------------------------------------------------------
  // Host cancels the active vote without announcing a winner. Just clears
  // state and broadcasts an inactive `vote:state`.
  socket.on('vote:cancel', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room) return

      if (room.host !== socket.id) {
        socket.emit('room:error', { event: 'vote:cancel', message: 'only host can cancel a vote' })
        return
      }

      room.vote = null
      io.to(roomId).emit('vote:state', voteStatePayload(room))
      console.log(`[vote:cancel] ${socket.id} -> ${roomId}`)
    } catch (err) {
      console.error(`[vote:cancel] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:cancel', message: 'internal error' })
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
          // If the disconnected socket had cast a vote on the active vote,
          // drop it and re-broadcast the tally so the count is live.
          const room = rooms.get(roomId)
          if (room && room.vote && room.vote.votes.has(socket.id)) {
            room.vote.votes.delete(socket.id)
            io.to(roomId).emit('vote:state', voteStatePayload(room))
          }
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
