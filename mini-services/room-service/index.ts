/**
 * RankForge Room Service  —  Real-time collaborative tier-list server.
 * --------------------------------------------------------------
 * Standalone socket.io mini-service that powers real-time collaboration
 * on a shared RankForge tier-list board. Supports up to 10 users per room
 * with presence, identity, activity log, heartbeats, idempotency (seq),
 * and reconnection resync.
 *
 * Runs on a FIXED port 3003. The Next.js frontend connects via the Caddy
 * gateway using `io("/?XTransformPort=3003")` — the gateway forwards based
 * on that query param, so we just bind :3003 and accept all origins.
 *
 * State is in-memory only (no database). Rooms are dropped on restart.
 *
 * Lifecycle:
 *   1. Client connects (socket established, but no user yet).
 *   2. Client emits `identity` { name, color }   -> stored on socket.data.
 *   3. Client emits `room:join` { roomId, board? } -> becomes a full member.
 *   4. Client emits `heartbeat` every ~20s        -> refreshes lastSeen.
 *   5. Server sweeps every 15s; any member with lastSeen > 45s is force-
 *      disconnected (reclaims dead sessions).
 *   6. On disconnect: member removed, presence re-broadcast, host promoted
 *      (first remaining by Map insertion order), active vote scrubbed,
 *      "left" activity logged.
 *
 * seq numbers: every state-changing broadcast (board:update relay, vote:state,
 * vote:result, presence:update, activity:new) increments `room.seq` and
 * includes the new seq in its payload. Clients use this as a monotonic
 * ordering signal for reconciliation / gap detection.
 *
 * Idempotency: `board:update` carries an optional `eventId`. The server does
 * NOT dedupe by eventId (full-board sync is inherently idempotent), but it
 * relays `{ board, seq, eventId }` so clients can skip their own echo
 * (match eventId) and detect gaps (seq).
 */

import { createServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of a board payload — treated as an opaque JSON object. */
type Board = Record<string, unknown> | null

/** A user present in a room. `id` is the socket id (unique per connection). */
interface User {
  id: string // socket id
  identityId: string // stable client id (localStorage) for assignment / scoring
  name: string // display name, max 20 chars
  color: string // hex color for avatar, e.g. "#f43f5e"
  presence: 'online' | 'idle' | 'dragging' | 'voting'
  lastSeen: number // epoch ms, updated on heartbeat / activity
}

/** A single line in the room activity log. */
interface ActivityEntry {
  id: string // unique id (crypto.randomUUID with fallback)
  userId: string
  userName: string
  action:
    | 'joined'
    | 'left'
    | 'added'
    | 'moved'
    | 'deleted'
    | 'vote_started'
    | 'voted'
    | 'vote_ended'
    | 'vote_cancelled'
    | 'rating_started'
    | 'rating_submitted'
    | 'rating_ended'
    | 'rating_cancelled'
  detail: string // human-readable, e.g. "Street Tacos to A", "S for Arcade Night"
  ts: number // epoch ms
}

/** Active vote on a single item. `votes` maps voter socket id -> chosen tierId. */
interface VoteState {
  itemId: string
  item: Record<string, unknown>
  votes: Map<string, string> // socketId -> tierId
  startedBy: string // socket id of the host who started it
}

/** Anonymous peer-rating round — each member rates unranked items on S–D. */
interface RatingTarget {
  id: string
  label: string
  imageUrl?: string
  linkedPlayerId?: string
  linkedPlayerName?: string
  linkedPlayerColor?: string
}

interface PeerRatingState {
  /** voter identityId -> itemId -> tier letter (S/A/B/C/D) */
  ballots: Map<string, Map<string, string>>
  startedBy: string
  targets: RatingTarget[]
}

/** Full per-room state. */
interface RoomState {
  /** socket id -> User. Map preserves insertion order = join order. */
  members: Map<string, User>
  /** socket id of the room host (first joiner); promoted on disconnect. */
  host: string | null
  /** latest board snapshot so late joiners can hydrate immediately. */
  board: Board
  /** active item vote, if any; null when no vote is in progress. */
  vote: VoteState | null
  /** active anonymous peer-rating round */
  peerRating: PeerRatingState | null
  /** last 40 activity entries, newest last. */
  activity: ActivityEntry[]
  /** server sequence counter; increments on each state-changing broadcast. */
  seq: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on members per room. */
const MAX_MEMBERS = 10

/** Activity log cap (last N entries kept). */
const MAX_ACTIVITY = 40

/** Heartbeat sweep interval (server-side reaper). */
const HEARTBEAT_SWEEP_MS = 15_000

/** A member is considered dead if no heartbeat for this long. */
const HEARTBEAT_TIMEOUT_MS = 45_000

/** Allowed presence states. */
const PRESENCE_STATES = new Set(['online', 'idle', 'dragging', 'voting'])

/** Allowed activity actions (for the client-driven `activity:log` event). */
const ALLOWED_ACTIONS = new Set([
  'joined',
  'left',
  'added',
  'moved',
  'deleted',
  'vote_started',
  'voted',
  'vote_ended',
  'vote_cancelled',
  'rating_started',
  'rating_submitted',
  'rating_ended',
  'rating_cancelled',
])

/** Hidden peer-rating weights — never sent to clients. */
const PEER_TIER_VALUE: Record<string, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  S: 4.35,
}
const PEER_VALUE_TO_TIER = ['D', 'C', 'B', 'A', 'S'] as const

function peerTierValue(letter: string): number {
  return PEER_TIER_VALUE[letter] ?? 0
}

function hiddenAverageToPeerTier(avg: number): string {
  const idx = Math.min(4, Math.max(0, Math.floor(avg)))
  return PEER_VALUE_TO_TIER[idx]
}

function isPeerTierLetter(v: string): boolean {
  return v === 'S' || v === 'A' || v === 'B' || v === 'C' || v === 'D'
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
// Small utilities
// ---------------------------------------------------------------------------

/** Generate a unique id (crypto.randomUUID with safe fallback). */
function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Best-effort human label for an item object, falling back to itemId. */
function itemLabel(item: Record<string, unknown> | null, fallback: string): string {
  if (item && typeof item === 'object') {
    if (typeof item.label === 'string' && item.label.trim()) return item.label.trim()
    if (typeof item.name === 'string' && item.name.trim()) return item.name.trim()
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Room helpers
// ---------------------------------------------------------------------------

/** Get-or-create a RoomState for a given room id. */
function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId)
  if (!room) {
    room = {
      members: new Map<string, User>(),
      host: null,
      board: null,
      vote: null,
      peerRating: null,
      activity: [],
      seq: 0,
    }
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

/**
 * Remove a socket from a room and clean up the reverse index. If the host
 * left, promote the first remaining member by Map insertion order (which is
 * the join order). Does NOT broadcast — the caller is responsible for that.
 */
function forgetRoom(socketId: string, roomId: string): void {
  const room = rooms.get(roomId)
  if (room) {
    room.members.delete(socketId)
    if (room.host === socketId) {
      // Promote the first remaining member by insertion order.
      const next = room.members.size > 0 ? (room.members.keys().next().value ?? null) : null
      room.host = next
    }
    // If empty, we keep the snapshot in memory so a quick reconnect restores
    // state. The room Map entry stays around; that's fine for a mini-service.
  }
  socketRooms.get(socketId)?.delete(roomId)
}

/** Return the list of members in join order (Map insertion order). */
function presenceList(room: RoomState): User[] {
  return Array.from(room.members.values())
}

/** Return the last MAX_ACTIVITY activity entries (newest last). */
function activityPayload(room: RoomState): ActivityEntry[] {
  return room.activity.slice(-MAX_ACTIVITY)
}

/** Push an activity entry and cap the stored log at MAX_ACTIVITY. */
function pushActivity(room: RoomState, entry: ActivityEntry): void {
  room.activity.push(entry)
  while (room.activity.length > MAX_ACTIVITY) {
    room.activity.shift()
  }
}

/** Increment and return the next sequence number for the room. */
function nextSeq(room: RoomState): number {
  return ++room.seq
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast `presence:update` to everyone in the room (including sender).
 * Includes the member list, the current host id, and the new seq.
 * (The `host` field lets clients update host badges after promotion.)
 */
function broadcastPresence(io: Server, room: RoomState, roomId: string): void {
  const seq = nextSeq(room)
  io.to(roomId).emit('presence:update', {
    members: presenceList(room),
    host: room.host,
    seq,
  })
}

/**
 * Push an activity entry to the log, then broadcast `activity:new` to the
 * whole room (including sender) with the new seq.
 */
function broadcastActivity(
  io: Server,
  room: RoomState,
  roomId: string,
  entry: ActivityEntry,
): void {
  pushActivity(room, entry)
  const seq = nextSeq(room)
  io.to(roomId).emit('activity:new', { entry, seq })
}

/** Build the vote:state payload to broadcast. tally is { tierId: count }. */
function voteStatePayload(
  room: RoomState,
  seq?: number,
  opts?: { includeItem?: boolean },
): {
  active: boolean
  itemId: string | null
  item?: Record<string, unknown> | null
  tally: Record<string, number>
  voterCount: number
  totalPeers: number
  voters: string[]
  seq: number
} {
  const vote = room.vote
  const tally: Record<string, number> = {}
  let voterCount = 0
  const voters: string[] = []
  if (vote) {
    for (const [socketId, tierId] of vote.votes) {
      tally[tierId] = (tally[tierId] ?? 0) + 1
      voterCount++
      voters.push(socketId)
    }
  }
  const includeItem = opts?.includeItem !== false
  return {
    active: !!vote,
    itemId: vote?.itemId ?? null,
    ...(includeItem ? { item: vote?.item ?? null } : {}),
    tally,
    voterCount,
    totalPeers: room.members.size,
    // socket ids of members who have cast a vote (so clients can show who has
    // / hasn't voted by cross-referencing the presence member list).
    voters,
    seq: seq ?? room.seq,
  }
}

/** Build rating:state — never exposes individual ballots. */
function ratingStatePayload(
  room: RoomState,
  seq?: number,
): {
  active: boolean
  submittedCount: number
  totalPeers: number
  submittedIdentityIds: string[]
  targets: RatingTarget[]
  seq: number
} {
  const rating = room.peerRating
  const submittedIdentityIds = rating
    ? Array.from(rating.ballots.keys())
    : []
  return {
    active: !!rating,
    submittedCount: submittedIdentityIds.length,
    totalPeers: room.members.size,
    submittedIdentityIds,
    targets: rating?.targets ?? [],
    seq: seq ?? room.seq,
  }
}

function computePeerRatingResults(room: RoomState): Record<
  string,
  {
    tier: string
    hiddenAverage: number
    label: string
    imageUrl?: string
    linkedPlayerName?: string
    linkedPlayerColor?: string
  }
> {
  const rating = room.peerRating
  if (!rating) return {}
  const members = Array.from(room.members.values())
  const playerCount = Math.max(1, members.length)
  const results: Record<
    string,
    {
      tier: string
      hiddenAverage: number
      label: string
      imageUrl?: string
      linkedPlayerName?: string
      linkedPlayerColor?: string
    }
  > = {}

  for (const target of rating.targets) {
    let sum = 0
    let count = 0
    for (const ballot of rating.ballots.values()) {
      const pick = ballot.get(target.id)
      if (!pick || !isPeerTierLetter(pick)) continue
      sum += peerTierValue(pick)
      count += 1
    }
    if (count === 0) continue
    const hiddenAverage = sum / playerCount
    results[target.id] = {
      tier: hiddenAverageToPeerTier(hiddenAverage),
      hiddenAverage,
      label: target.label,
      ...(target.imageUrl ? { imageUrl: target.imageUrl } : {}),
      ...(target.linkedPlayerName ? { linkedPlayerName: target.linkedPlayerName } : {}),
      ...(target.linkedPlayerColor ? { linkedPlayerColor: target.linkedPlayerColor } : {}),
    }
  }
  return results
}

/** One seq bump, single room broadcast (clients derive hasSubmitted locally). */
function broadcastRatingState(io: Server, room: RoomState, roomId: string): void {
  if (!room.peerRating) return
  const seq = nextSeq(room)
  io.to(roomId).emit('rating:state', ratingStatePayload(room, seq))
}

/** Inactive rating:state — same payload for every client. */
function broadcastRatingInactive(io: Server, room: RoomState, roomId: string): void {
  const seq = nextSeq(room)
  io.to(roomId).emit('rating:state', {
    active: false,
    submittedCount: 0,
    totalPeers: room.members.size,
    submittedIdentityIds: [],
    targets: [],
    seq,
  })
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
// Heartbeat sweep (server-side reaper)
// ---------------------------------------------------------------------------

/**
 * Every HEARTBEAT_SWEEP_MS, iterate all rooms and force-disconnect any member
 * whose `lastSeen` is older than HEARTBEAT_TIMEOUT_MS. The normal `disconnect`
 * handler then takes care of cleanup (presence, host promotion, vote scrub,
 * activity log). This reclaims dead sessions that the socket.io ping/pong
 * layer might miss (e.g. half-open TCP).
 */
const heartbeatSweep = setInterval(() => {
  try {
    const now = Date.now()
    for (const [roomId, room] of rooms) {
      for (const [socketId, user] of room.members) {
        const idle = now - user.lastSeen
        if (idle > HEARTBEAT_TIMEOUT_MS) {
          const s = io.sockets.sockets.get(socketId)
          if (s && s.connected) {
            console.log(
              `[heartbeat] force-disconnect ${socketId} in ${roomId} (idle ${idle}ms)`,
            )
            // `true` = close the underlying connection. This triggers the
            // normal `disconnect` handler, which cleans up state.
            s.disconnect(true)
          }
        }
      }
    }
  } catch (err) {
    console.error('[heartbeat] sweep error:', err)
  }
}, HEARTBEAT_SWEEP_MS)

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`)

  // ----- identity --------------------------------------------------------
  // Set display name + color on the socket. Does NOT join a room yet — the
  // client must follow up with `room:join`. Until then the socket is a
  // "pending" socket (connected but not a member of any room).
  socket.on('identity', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { name?: string; color?: string; identityId?: string }
      let name = typeof data.name === 'string' ? data.name.trim().slice(0, 20) : ''
      if (!name) name = 'Guest'
      const color =
        typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color)
          ? data.color
          : '#64748b'
      const identityId =
        typeof data.identityId === 'string' && data.identityId.trim()
          ? data.identityId.trim().slice(0, 64)
          : socket.id
      socket.data.identity = { name, color, identityId }
      console.log(`[identity] ${socket.id} name=${name} color=${color} identityId=${identityId}`)
    } catch (err) {
      console.error(`[identity] error from ${socket.id}:`, err)
    }
  })

  // ----- room:join -------------------------------------------------------
  // Join (or create) a room. Enforces the 10-user cap. Reads identity from
  // socket.data (set via `identity` event; defaults to Guest/#64748b). Sends
  // the joiner a full state bundle (room:state + presence:update +
  // activity:sync + vote:state if active), then broadcasts presence + a
  // "joined" activity to the room.
  socket.on('room:join', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; board?: Board }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) {
        socket.emit('room:error', { event: 'room:join', message: 'roomId is required' })
        return
      }

      // 10-user cap: reject if the room is already full.
      const existing = rooms.get(roomId)
      if (existing && existing.members.size >= MAX_MEMBERS) {
        socket.emit('room:error', {
          event: 'room:join',
          message: 'Room is full (max 10)',
        })
        return
      }

      // Leave any rooms this socket was previously in (a socket is in one
      // RankForge room at a time). Broadcast presence:update + scrub any
      // active vote from the old room.
      const previous = socketRooms.get(socket.id)
      if (previous && previous.size > 0) {
        for (const oldRoomId of previous) {
          const oldRoom = rooms.get(oldRoomId)
          forgetRoom(socket.id, oldRoomId)
          socket.leave(oldRoomId)
          if (oldRoom) {
            broadcastPresence(io, oldRoom, oldRoomId)
            // If the switching user had voted on an active vote, drop it
            // and re-broadcast the tally so the count is live.
            if (oldRoom.vote && oldRoom.vote.votes.has(socket.id)) {
              oldRoom.vote.votes.delete(socket.id)
              io.to(oldRoomId).emit('vote:state', voteStatePayload(oldRoom, nextSeq(oldRoom)))
            }
          }
        }
      }

      const room = getOrCreateRoom(roomId)
      const wasNew = room.members.size === 0

      // Read identity (set via `identity` event; default to Guest/#64748b).
      const identity =
        (socket.data?.identity as { name: string; color: string; identityId?: string } | undefined) ?? {
          name: 'Guest',
          color: '#64748b',
          identityId: socket.id,
        }

      const user: User = {
        id: socket.id,
        identityId: identity.identityId ?? socket.id,
        name: identity.name,
        color: identity.color,
        presence: 'online',
        lastSeen: Date.now(),
      }

      socket.join(roomId)
      room.members.set(socket.id, user)
      rememberRoom(socket.id, roomId)

      // First joiner (or recovered host-less room) becomes host.
      if (wasNew || room.host === null) {
        room.host = socket.id
      }

      // Update the stored snapshot if the client provided a board.
      if (data.board !== undefined && data.board !== null) {
        room.board = data.board
      }

      const isHost = room.host === socket.id

      // 1. Full state bundle to the joiner.
      socket.emit('room:state', {
        roomId,
        isHost,
        peers: room.members.size,
        board: room.board,
        seq: room.seq,
      })

      // 2. Presence to the joiner (direct; uses current seq, no increment).
      socket.emit('presence:update', {
        members: presenceList(room),
        host: room.host,
        seq: room.seq,
      })

      // 3. Activity log to the joiner (last 40 entries).
      socket.emit('activity:sync', { entries: activityPayload(room) })

      // 4. If a vote is currently active, hydrate the joiner (no seq bump).
      if (room.vote) {
        socket.emit('vote:state', voteStatePayload(room))
      }

      // 5. If a peer-rating round is active, hydrate the joiner.
      if (room.peerRating) {
        socket.emit('rating:state', ratingStatePayload(room))
      }

      // 6. Broadcast presence to the whole room (including joiner).
      broadcastPresence(io, room, roomId)

      // 6. Push + broadcast "joined" activity to the whole room.
      broadcastActivity(io, room, roomId, {
        id: uuid(),
        userId: socket.id,
        userName: user.name,
        action: 'joined',
        detail: user.name,
        ts: Date.now(),
      })

      console.log(
        `[room:join] ${socket.id} -> ${roomId} (peers=${room.members.size}, host=${isHost})`,
      )
    } catch (err) {
      console.error(`[room:join] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'room:join', message: 'internal error' })
    }
  })

  // ----- board:update ----------------------------------------------------
  // A client changed its local board and wants to broadcast to peers.
  // We store the snapshot AND relay to everyone else (NOT back to sender,
  // since the sender already has the optimistic local state). Includes the
  // new seq + the client-supplied eventId so peers can skip re-applying their
  // own echo and detect gaps.
  socket.on('board:update', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        board?: Board
        eventId?: string
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      if (!roomId || data.board === undefined || data.board === null) return

      const room = rooms.get(roomId)
      if (!room) return // must join before updating

      room.board = data.board
      const seq = nextSeq(room)
      // Relay to OTHERS only (sender already has optimistic state).
      socket.to(roomId).emit('board:update', {
        board: data.board,
        seq,
        eventId: typeof data.eventId === 'string' ? data.eventId : undefined,
      })
    } catch (err) {
      console.error(`[board:update] error from ${socket.id}:`, err)
    }
  })

  // ----- activity:log ----------------------------------------------------
  // Client-driven activity logging. The sender emits this right after a
  // user-visible board action (add/move/delete) so the activity feed can say
  // "Mason moved Street Tacos to A" without the server parsing board diffs
  // (which is fragile). The server just validates, builds the entry, and
  // broadcasts it to the whole room (including sender).
  socket.on('activity:log', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; action?: string; detail?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const action = typeof data.action === 'string' ? data.action : ''
      const detail =
        typeof data.detail === 'string' ? data.detail.trim().slice(0, 120) : ''
      if (!roomId || !ALLOWED_ACTIONS.has(action)) return

      const room = rooms.get(roomId)
      if (!room) return
      const user = room.members.get(socket.id)
      if (!user) return

      const entry: ActivityEntry = {
        id: uuid(),
        userId: socket.id,
        userName: user.name,
        action: action as ActivityEntry['action'],
        detail,
        ts: Date.now(),
      }
      broadcastActivity(io, room, roomId, entry)
      console.log(`[activity:log] ${socket.id} ${action} "${detail}" in ${roomId}`)
    } catch (err) {
      console.error(`[activity:log] error from ${socket.id}:`, err)
    }
  })

  // ----- presence:set ----------------------------------------------------
  // Client tells the server its current fine-grained presence state (online /
  // idle / dragging / voting). Clients should throttle this on their side.
  // Server updates the user and re-broadcasts presence to the room.
  socket.on('presence:set', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; state?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const state = typeof data.state === 'string' ? data.state : ''
      if (!roomId || !PRESENCE_STATES.has(state)) return

      const room = rooms.get(roomId)
      if (!room) return
      const user = room.members.get(socket.id)
      if (!user) return

      const nextPresence = state as User['presence']
      if (user.presence === nextPresence) {
        user.lastSeen = Date.now()
        return
      }
      user.presence = nextPresence
      user.lastSeen = Date.now()
      broadcastPresence(io, room, roomId)
    } catch (err) {
      console.error(`[presence:set] error from ${socket.id}:`, err)
    }
  })

  // ----- focus:set -------------------------------------------------------
  // A user is hovering / started dragging a specific item. PURE RELAY — we
  // do NOT store any focus state server-side (it's ephemeral; clients clear
  // it on a timer). Validates roomId + itemId are non-empty strings, looks
  // up the room + the user (socket.id -> members; if not found, silent
  // return), then relays to OTHER clients in the room so they can render a
  // colored highlight + the focusing user's avatar on that item.
  // High-frequency event: NO log line per emit (would spam — debug only if
  // ever needed).
  socket.on('focus:set', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string; itemId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const itemId = typeof data.itemId === 'string' ? data.itemId.trim() : ''
      if (!roomId || !itemId) return

      const room = rooms.get(roomId)
      if (!room) return
      const user = room.members.get(socket.id)
      if (!user) return

      socket.to(roomId).volatile.emit('focus:set', {
        userId: socket.id,
        userName: user.name,
        userColor: user.color,
        itemId,
      })
    } catch (err) {
      console.error(`[focus:set] error from ${socket.id}:`, err)
    }
  })

  // ----- focus:clear -----------------------------------------------------
  // A user stopped hovering / dragging. PURE RELAY — no server state to
  // clean up. Validates roomId, then relays to OTHER clients in the room so
  // they can drop that user's highlight.
  socket.on('focus:clear', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      socket.to(roomId).volatile.emit('focus:clear', { userId: socket.id })
    } catch (err) {
      console.error(`[focus:clear] error from ${socket.id}:`, err)
    }
  })

  // ----- heartbeat -------------------------------------------------------
  // Client emits this every ~20s (no payload). Server refreshes the user's
  // lastSeen across all rooms they're in. The server-side sweep uses
  // lastSeen to decide who to force-disconnect.
  socket.on('heartbeat', () => {
    try {
      const joined = socketRooms.get(socket.id)
      if (!joined || joined.size === 0) return
      const now = Date.now()
      for (const roomId of joined) {
        const room = rooms.get(roomId)
        const user = room?.members.get(socket.id)
        if (user) user.lastSeen = now
      }
    } catch (err) {
      console.error(`[heartbeat] error from ${socket.id}:`, err)
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
  // directly to the requester (no seq bump — hydration only).
  socket.on('vote:sync-request', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      const room = roomId ? rooms.get(roomId) : undefined
      socket.emit(
        'vote:state',
        room
          ? voteStatePayload(room)
          : {
              active: false,
              itemId: null,
              item: null,
              tally: {},
              voterCount: 0,
              totalPeers: 0,
              voters: [],
              seq: 0,
            },
      )
    } catch (err) {
      console.error(`[vote:sync-request] error from ${socket.id}:`, err)
    }
  })

  // ----- vote:start ------------------------------------------------------
  // Host kicks off a vote on a specific item. The item "pops up" for everyone
  // in the room; each peer then casts one vote for a tier via `vote:cast`.
  // Also logs a "vote_started" activity entry.
  socket.on('vote:start', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        itemId?: string
        item?: Record<string, unknown>
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const itemId = typeof data.itemId === 'string' ? data.itemId.trim() : ''
      if (
        !roomId ||
        !itemId ||
        typeof data.item !== 'object' ||
        data.item === null ||
        Array.isArray(data.item)
      ) {
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

      if (room.peerRating) {
        room.peerRating = null
        broadcastRatingInactive(io, room, roomId)
      }

      room.vote = {
        itemId,
        item: {
          id: itemId,
          type: data.item.type === 'image' ? 'image' : 'text',
          label:
            typeof data.item.label === 'string' && data.item.label.trim()
              ? data.item.label.trim()
              : itemId,
          ...(typeof data.item.imageUrl === 'string'
            ? { imageUrl: data.item.imageUrl }
            : {}),
        },
        votes: new Map<string, string>(),
        startedBy: socket.id,
      }

      io.to(roomId).emit('vote:state', voteStatePayload(room, nextSeq(room), { includeItem: true }))

      // NOTE: vote_started activity is sent by the client via activity:log
      // (the client has the readable item label; we don't duplicate it here).

      console.log(`[vote:start] ${socket.id} -> ${roomId} item=${itemId}`)
    } catch (err) {
      console.error(`[vote:start] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:start', message: 'internal error' })
    }
  })

  // ----- vote:cast --------------------------------------------------------
  // A peer casts (or re-casts) their vote for a tier on the active item.
  // Stale votes (wrong itemId / no active vote) are ignored silently.
  // Also logs a "voted" activity entry (detail = "<item label> -> <tierId>").
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
      if (!room.members.has(socket.id)) return // must be a room member

      room.vote.votes.set(socket.id, tierId)
      // Tally-only relay — clients already have item from vote:start.
      io.to(roomId).emit(
        'vote:state',
        voteStatePayload(room, nextSeq(room), { includeItem: false }),
      )

      // NOTE: voted activity is sent by the client via activity:log
      // (the client formats it as "S for Arcade Night" which is more readable).

      console.log(`[vote:cast] ${socket.id} voted ${tierId} in ${roomId}`)
    } catch (err) {
      console.error(`[vote:cast] error from ${socket.id}:`, err)
    }
  })

  // ----- vote:end ---------------------------------------------------------
  // Host ends the active vote. Winner = tierId with the highest count; ties
  // broken by ascending alphabetical tierId (deterministic). If no votes were
  // cast, winner = null. Emits `vote:result` then a final inactive `vote:state`
  // so clients close the overlay. Also logs a "vote_ended" activity.
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
        seq: nextSeq(room),
      })

      room.vote = null
      io.to(roomId).emit('vote:state', voteStatePayload(room, nextSeq(room)))

      // NOTE: vote_ended activity is sent by the client via activity:log.

      console.log(`[vote:end] ${socket.id} -> ${roomId} winner=${winner}`)
    } catch (err) {
      console.error(`[vote:end] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:end', message: 'internal error' })
    }
  })

  // ----- vote:cancel ------------------------------------------------------
  // Host cancels the active vote without announcing a winner. Just clears
  // state and broadcasts an inactive `vote:state`. Also logs a
  // "vote_cancelled" activity.
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

      const wasItemId = room.vote?.itemId ?? ''
      room.vote = null
      io.to(roomId).emit('vote:state', voteStatePayload(room, nextSeq(room)))

      // NOTE: vote_cancelled activity is sent by the client via activity:log.

      console.log(`[vote:cancel] ${socket.id} -> ${roomId}`)
    } catch (err) {
      console.error(`[vote:cancel] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'vote:cancel', message: 'internal error' })
    }
  })

  // ----- rating:sync-request ----------------------------------------------
  socket.on('rating:sync-request', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId : ''
      const room = roomId ? rooms.get(roomId) : undefined
      socket.emit(
        'rating:state',
        room
          ? ratingStatePayload(room)
          : {
              active: false,
              submittedCount: 0,
              totalPeers: 0,
              submittedIdentityIds: [],
              targets: [],
              seq: 0,
            },
      )
    } catch (err) {
      console.error(`[rating:sync-request] error from ${socket.id}:`, err)
    }
  })

  // ----- rating:start ------------------------------------------------------
  socket.on('rating:start', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        targets?: RatingTarget[]
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room) {
        socket.emit('room:error', { event: 'rating:start', message: 'room not found' })
        return
      }
      if (room.host !== socket.id) {
        socket.emit('room:error', {
          event: 'rating:start',
          message: 'only host can start a rating round',
        })
        return
      }
      if (room.members.size < 2) {
        socket.emit('room:error', {
          event: 'rating:start',
          message: 'need at least 2 players',
        })
        return
      }

      const targetsRaw = Array.isArray(data.targets) ? data.targets : []
      const targets: RatingTarget[] = []
      for (const raw of targetsRaw) {
        if (!raw || typeof raw !== 'object') continue
        const t = raw as Record<string, unknown>
        const id = typeof t.id === 'string' ? t.id.trim() : ''
        const label = typeof t.label === 'string' ? t.label.trim() : ''
        if (!id || !label) continue
        targets.push({
          id,
          label,
          ...(typeof t.imageUrl === 'string' ? { imageUrl: t.imageUrl } : {}),
          ...(typeof t.linkedPlayerId === 'string'
            ? { linkedPlayerId: t.linkedPlayerId }
            : {}),
          ...(typeof t.linkedPlayerName === 'string'
            ? { linkedPlayerName: t.linkedPlayerName }
            : {}),
          ...(typeof t.linkedPlayerColor === 'string'
            ? { linkedPlayerColor: t.linkedPlayerColor }
            : {}),
        })
      }

      if (targets.length === 0) {
        socket.emit('room:error', {
          event: 'rating:start',
          message: 'add cards to unranked before starting a rating round',
        })
        return
      }

      room.peerRating = { ballots: new Map(), startedBy: socket.id, targets }
      if (room.vote) {
        room.vote = null
        io.to(roomId).emit('vote:state', voteStatePayload(room, nextSeq(room)))
      }

      broadcastRatingState(io, room, roomId)

      console.log(`[rating:start] ${socket.id} -> ${roomId}`)
    } catch (err) {
      console.error(`[rating:start] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'rating:start', message: 'internal error' })
    }
  })

  // ----- rating:submit -----------------------------------------------------
  socket.on('rating:submit', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as {
        roomId?: string
        votes?: Record<string, string>
      }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room?.peerRating) return
      if (!room.members.has(socket.id)) return

      const voter = room.members.get(socket.id)!
      const voterId = voter.identityId
      const votesRaw = data.votes
      if (!votesRaw || typeof votesRaw !== 'object') return

      const peerRating = room.peerRating
      const ballot = new Map<string, string>()
      const targetIds = new Set(peerRating.targets.map((t) => t.id))

      for (const [itemId, tier] of Object.entries(votesRaw)) {
        if (!targetIds.has(itemId)) continue
        if (typeof tier !== 'string' || !isPeerTierLetter(tier)) continue
        ballot.set(itemId, tier)
      }

      if (ballot.size < peerRating.targets.length) return

      peerRating.ballots.set(voterId, ballot)
      broadcastRatingState(io, room, roomId)

      console.log(`[rating:submit] ${socket.id} in ${roomId}`)
    } catch (err) {
      console.error(`[rating:submit] error from ${socket.id}:`, err)
    }
  })

  // ----- rating:end --------------------------------------------------------
  socket.on('rating:end', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room?.peerRating) return
      if (room.host !== socket.id) {
        socket.emit('room:error', {
          event: 'rating:end',
          message: 'only host can end a rating round',
        })
        return
      }

      const results = computePeerRatingResults(room)
      const placements = Object.entries(results).map(([itemId, row]) => ({
        itemId,
        tier: row.tier,
      }))
      room.peerRating = null

      io.to(roomId).emit('rating:result', { results, placements, seq: nextSeq(room) })
      broadcastRatingInactive(io, room, roomId)

      console.log(`[rating:end] ${socket.id} -> ${roomId}`)
    } catch (err) {
      console.error(`[rating:end] error from ${socket.id}:`, err)
      socket.emit('room:error', { event: 'rating:end', message: 'internal error' })
    }
  })

  // ----- rating:cancel -----------------------------------------------------
  socket.on('rating:cancel', (payload: unknown) => {
    try {
      const data = (payload ?? {}) as { roomId?: string }
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return

      const room = rooms.get(roomId)
      if (!room?.peerRating) return
      if (room.host !== socket.id) {
        socket.emit('room:error', {
          event: 'rating:cancel',
          message: 'only host can cancel a rating round',
        })
        return
      }

      room.peerRating = null
      broadcastRatingInactive(io, room, roomId)

      console.log(`[rating:cancel] ${socket.id} -> ${roomId}`)
    } catch (err) {
      console.error(`[rating:cancel] error from ${socket.id}:`, err)
    }
  })

  // ----- disconnect ------------------------------------------------------
  // Remove the socket from every room it was in. For each affected room:
  //   - re-broadcast presence (with the possibly-new host),
  //   - push + broadcast a "left" activity,
  //   - if the user had voted on an active vote, scrub it and re-broadcast.
  // Finally clear the socket's identity.
  socket.on('disconnect', (reason: string) => {
    try {
      const joined = socketRooms.get(socket.id)
      if (joined) {
        for (const roomId of joined) {
          const room = rooms.get(roomId)
          // Capture the user BEFORE forgetRoom mutates the members Map.
          const user = room?.members.get(socket.id)

          // Relay focus:clear to OTHER clients in this room so they remove
          // the disconnecting user's highlight. The socket is still valid
          // for one last `to()` emit during disconnect (it hasn't been
          // `leave()`'d yet), so we do this BEFORE forgetRoom/leave.
          try {
            socket.to(roomId).emit('focus:clear', { userId: socket.id })
          } catch {
            /* best-effort; never crash disconnect cleanup */
          }

          forgetRoom(socket.id, roomId)
          socket.leave(roomId)

          if (room) {
            // 1. Broadcast updated presence (includes new host id, if promoted).
            broadcastPresence(io, room, roomId)

            // 2. Push + broadcast "left" activity.
            if (user) {
              broadcastActivity(io, room, roomId, {
                id: uuid(),
                userId: socket.id,
                userName: user.name,
                action: 'left',
                detail: user.name,
                ts: Date.now(),
              })
            }

            // 3. If the disconnected user had voted on the active vote, drop
            //    their vote and re-broadcast the tally so the count is live.
            if (room.vote && room.vote.votes.has(socket.id)) {
              room.vote.votes.delete(socket.id)
              io.to(roomId).emit('vote:state', voteStatePayload(room, nextSeq(room)))
            }

            if (room.peerRating && user) {
              room.peerRating.ballots.delete(user.identityId)
              broadcastRatingState(io, room, roomId)
            }
          }
        }
        socketRooms.delete(socket.id)
      }

      // Clear identity (forces re-identity on reconnect if socket is reused).
      socket.data.identity = undefined

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

// Render (and most PaaS hosts) inject the port to bind via $PORT. Fall back to
// 3003 for local dev where the Caddy gateway expects that fixed port.
const PORT = Number(process.env.PORT) || 3003
httpServer.listen(PORT, () => {
  console.log(`room-service on :${PORT}`)
})

// Graceful shutdown so `bun --hot` restarts don't leave dangling sockets or
// a dangling heartbeat interval.
function shutdown(signal: string): void {
  console.log(`[${signal}] shutting down room-service...`)
  clearInterval(heartbeatSweep)
  io.close(() => {
    httpServer.close(() => {
      console.log('room-service closed')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
