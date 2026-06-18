# Task 7 — Focus/Cursor Relay (room-service)

**Agent**: full-stack-developer
**Task**: Add lightweight, stateless `focus:set` / `focus:clear` relay events to the existing RankForge room-service (`mini-services/room-service/index.ts`, port 3003). Pure relay — no server-side focus storage.

## Context reviewed
- Read `/home/z/my-project/worklog.md` (Tasks 0–6) to understand the existing architecture: identity → room:join (10-user cap) → presence (online/idle/dragging/voting) → activity log → heartbeats → seq numbers → eventId idempotency → reconnect/resync → voting (start/cast/end/cancel/sync-request). Built by Task 5 (subagent).
- Read the full existing `mini-services/room-service/index.ts` (935 lines) end-to-end to preserve all existing behavior. Key in-memory state: `rooms: Map<roomId, RoomState>`, `socketRooms: Map<socketId, Set<roomId>>` (reverse index for O(1) disconnect cleanup), `RoomState { members: Map<socketId, User>, host, board, vote, activity, seq }`, `User { id, name, color, presence, lastSeen }`.

## Changes made to `mini-services/room-service/index.ts`

### 1. `focus:set` handler (new)
Inserted right after `presence:set` (line ~611), before `heartbeat`. Logical grouping — focus is a fine-grained, ephemeral attention signal akin to presence.

```ts
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

    socket.to(roomId).emit('focus:set', {
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
      itemId,
    })
  } catch (err) {
    console.error(`[focus:set] error from ${socket.id}:`, err)
  }
})
```

- Validates `roomId` + `itemId` are non-empty strings (silent return otherwise).
- Looks up room + user (socket.id → members); silent return if either is missing.
- Relays to OTHER clients only via `socket.to(roomId).emit(...)` (no self-echo).
- NO server-side state stored — focus is purely ephemeral.
- NO per-emit log line (high-frequency event).

### 2. `focus:clear` handler (new)
Inserted right after `focus:set`.

```ts
socket.on('focus:clear', (payload: unknown) => {
  try {
    const data = (payload ?? {}) as { roomId?: string }
    const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
    if (!roomId) return

    socket.to(roomId).emit('focus:clear', { userId: socket.id })
  } catch (err) {
    console.error(`[focus:clear] error from ${socket.id}:`, err)
  }
})
```

- Validates `roomId` is a non-empty string.
- Relays `{ userId: socket.id }` to OTHER clients only.
- No state to clean up.

### 3. Disconnect handler update
Inside the existing per-room loop, BEFORE `forgetRoom(socket.id, roomId)` and `socket.leave(roomId)`, emit a `focus:clear` so other clients drop the disconnecting user's highlight. The socket is still valid for one last `to()` emit during disconnect (it hasn't been `leave()`'d yet).

```ts
for (const roomId of joined) {
  const room = rooms.get(roomId)
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
  // ... existing presence / activity / vote-scrub logic unchanged ...
}
```

Wrapped in its own try/catch with empty catch — best-effort; never crashes the existing disconnect cleanup.

## Constraints honored
- **Stateless**: no focus storage added to `RoomState`, `User`, or anywhere else. Pure relay.
- **No existing handler touched**: identity, room:join, board:update, activity:log, presence:set, heartbeat, board:sync-request, vote:sync-request, vote:start, vote:cast, vote:end, vote:cancel, disconnect (existing logic), heartbeat sweep, graceful shutdown — all unchanged.
- **try/catch wrapping**: every new code path wrapped, errors logged with `[event]` prefix.
- **Port 3003, path "/", CORS "*"**: all preserved.
- **No per-emit log spam**: focus events are high-frequency; only error-path logging.

## Verification

### TypeScript build
```
$ cd mini-services/room-service && bun build index.ts --target=bun --outfile=/tmp/rs-check.js
  rs-check.js  0.47 MB  (entry point)
```
No errors.

### Service restart
- `pkill -f "room-service/index.ts"` did NOT match the running processes because `ps` shows `bun --hot index.ts` without the working-directory prefix.
- Switched to `pkill -f "bun --hot index.ts"` + `pkill -f "bun run dev"` which cleared 7 stale room-service processes accumulated from Tasks 1–6 (PIDs 3571, 8667, 10315, 12675, 15322, 15385, 16928).
- Plain `nohup bun run dev > service.log 2>&1 &` was being reaped when the bash tool's session exited. Used `setsid bun run dev > /abs/path/service.log 2>&1 < /dev/null &` to fully detach.
- After restart: `lsof -i:3003` → bun PID 17448 LISTEN on `*:3003`. `service.log` shows `$ bun --hot index.ts` + `room-service on :3003` with no errors.

### End-to-end smoke test
Throwaway `socket.io-client` script (in `/home/z/rf-focus-smoke/`, since deleted) with Alice (host) + Bob (guest) + Carol (non-member, connects + sets identity but never joins a room). 19 assertions, all passed:

| # | Scenario | Result |
|---|----------|--------|
| T1 | Alice `focus:set { roomId, itemId:'i1' }` → Bob receives `{ userId: alice.id, userName:'Alice', userColor:'#f43f5e', itemId:'i1' }`; NO self-echo to Alice | PASS (6 assertions) |
| T2 | Bob `focus:set { roomId, itemId:'i2' }` → Alice receives `{ userId: bob.id, userName:'Bob', userColor:'#22c55e', itemId:'i2' }` | PASS (5 assertions) |
| T3 | Alice `focus:clear { roomId }` → Bob receives `{ userId: alice.id }` and ONLY that key | PASS (3 assertions) |
| T4 | `focus:set { roomId }` (missing itemId) → no relay | PASS |
| T5 | Carol (non-member) `focus:set { roomId, itemId:'i3' }` → no relay | PASS |
| T6 | `focus:set { roomId:'NO-SUCH-ROOM', itemId:'i9' }` → no relay | PASS |
| T7 | Bob `disconnect()` → Alice receives `focus:clear { userId: bob.id }` | PASS (2 assertions) |

**Total: 19 passed, 0 failed.**

### service.log confirmation
- `[connect]`, `[identity]`, `[room:join]`, `[disconnect]` lines emitted as expected.
- NO `[focus:set]` / `[focus:clear]` log lines per emit (intentional — high-frequency event, kept quiet per spec).
- NO error lines.

## Exact payload shapes (for the frontend team)

### Client → Server
- `focus:set { roomId: string, itemId: string }` — user is hovering/dragging `itemId` in `roomId`.
- `focus:clear { roomId: string }` — user stopped hovering/dragging.

### Server → Client (relayed to OTHER clients in the room, NOT sender)
- `focus:set { userId: string, userName: string, userColor: string, itemId: string }` — render a colored highlight + small avatar (using `userColor` + `userName`) on the matching item card.
- `focus:clear { userId: string }` — remove that user's highlight.

### On disconnect
Server auto-emits `focus:clear { userId: <disconnected-socket-id> }` to each room the socket was in (before membership cleanup), so other clients drop the highlight without waiting for a client-side timer.

## Frontend integration notes (for the next agent)
- Emit `focus:set { roomId, itemId }` on item hover/drag-start (throttle on the client side — only emit when the focused itemId actually changes).
- Emit `focus:clear { roomId }` on hover-end/drag-end/blur.
- Listen for `focus:set` and render a colored ring + small avatar (using `userColor` + `userName`) on the matching item card.
- Listen for `focus:clear` and remove that user's highlight.
- Use a client-side timer (e.g. 5s) as a safety net to auto-clear highlights in case a `focus:clear` is missed — the server keeps no state so a missed relay can't be recovered.
- On `presence:update` member list shrinking (peer left), the server will already have emitted `focus:clear` for that user — but it's safe to also clear any highlight for a missing userId on the next `presence:update`.

## Files modified
- `mini-services/room-service/index.ts` (+~75 lines: 2 new relay handlers + disconnect focus:clear emit).
- `mini-services/room-service/service.log` (regenerated on restart).

## Stage summary
room-service on :3003 now also relays `focus:set` and `focus:clear` for cursor/hover highlight. Pure relay, stateless, no per-emit logging. 19/19 smoke assertions pass. Compile clean. No errors in service.log. All pre-existing room/board/presence/voting behavior unchanged.
