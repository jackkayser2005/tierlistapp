# Task ID: 9 — Live cursor relay

Agent: full-stack-developer
Date: 2025 (this turn)
Service: `mini-services/room-service/index.ts` (socket.io on port 3003)

## Task
Add a stateless, pure-relay `cursor:move` event for live cursor sharing to the
RankForge room-service, plus a `cursor:clear` event (client-driven) and a
`cursor:clear` relay on disconnect (server-driven). Mirror the existing
`focus:set` / `focus:clear` pattern.

## What changed in `index.ts`
1. **New `cursor:move` handler** (after `focus:clear`, before `heartbeat`):
   - Payload: `{ roomId?: string; x?: number; y?: number }`
   - Validates:
     - `roomId` is a non-empty string (trim first), else silent return.
     - `x` and `y` are finite numbers, else silent return.
     - `x` and `y` are in `[0, 100]` (percentage of viewport width/height),
       else silent return.
   - Looks up `rooms.get(roomId)` and `room.members.get(socket.id)`; if either
     is missing, silent return (no `room:error` — pure relay).
   - Relays to OTHER clients only:
     ```ts
     socket.to(roomId).emit('cursor:move', {
       userId: socket.id,
       userName: user.name,
       userColor: user.color,
       x,
       y,
       ts: Date.now(),
     })
     ```
   - High-frequency event: NO per-emit log line. Only logs on error
     (`console.error('[cursor:move] error from ...')`).
   - Wrapped in try/catch.

2. **New `cursor:clear` handler** (immediately after `cursor:move`):
   - Payload: `{ roomId?: string }`
   - Validates `roomId` is a non-empty string (trim first), else silent return.
   - Relays to OTHER clients: `socket.to(roomId).emit('cursor:clear', { userId: socket.id })`
   - Wrapped in try/catch; logs on error only.
   - Sent by clients when they leave the room / blur / go idle, AND by the
     server on disconnect.

3. **Disconnect handler** — added a `cursor:clear` relay block right next to
   the existing `focus:clear` relay, BEFORE `forgetRoom` / `socket.leave`,
   wrapped in its own try/catch so it can never crash disconnect cleanup:
   ```ts
   // Relay cursor:clear too, so peers remove the disconnecting user's
   // live cursor immediately (instead of waiting for their client-side
   // cursor timeout). Same try/catch mirror as focus:clear above.
   try {
     socket.to(roomId).emit('cursor:clear', { userId: socket.id })
   } catch {
     /* best-effort; never crash disconnect cleanup */
   }
   ```

## Constraints honored
- **Stateless**: no cursor state stored server-side. Pure relay.
- **No existing handlers touched** — only additions.
- All wrapped in try/catch; never crash.
- Port 3003, path `/`, CORS `*` unchanged.
- No per-emit logging (high frequency).

## Restart + verification
```bash
pkill -f "bun --hot index.ts" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
sleep 2
cd /home/z/my-project/mini-services/room-service && \
  setsid bun run dev > service.log 2>&1 < /dev/null &
sleep 3
lsof -i:3003 | grep LISTEN
# -> bun  20437  z  71u  IPv6 135933  0t0  TCP *:3003 (LISTEN)
```

`service.log` shows:
```
$ bun --hot index.ts
room-service on :3003
```
No errors.

`bun build index.ts --target=bun --outfile=/tmp/rs-check.js`:
```
rs-check.js  0.47 MB  (entry point)
```
Build clean, no TS errors.

## Exact payload shapes (wire contract)

### Client → Server
- `cursor:move` — `{ roomId: string; x: number; y: number }`
  (`x`, `y` are viewport percentages 0–100)
- `cursor:clear` — `{ roomId: string }`

### Server → Client (relayed to OTHERS, never sender)
- `cursor:move` —
  `{ userId: string; userName: string; userColor: string; x: number; y: number; ts: number }`
- `cursor:clear` — `{ userId: string }`
- On disconnect, the server emits `cursor:clear` with `{ userId: <socket.id> }`
  for each room the socket was in, so peers remove the cursor immediately.

## Frontend integration notes (for the next agent)
- Connect via `io("/?XTransformPort=3003")` (already used by Task 1+).
- On `mousemove` (throttled via rAF or 30–60ms), emit
  `cursor:move` with `{ roomId, x: (e.clientX / innerWidth) * 100, y: (e.clientY / innerHeight) * 100 }`.
- On `room:leave` / `blur` / extended idle, emit `cursor:clear`.
- Listen for `cursor:move` to render other users' pointers; maintain a
  `Map<userId, { x, y, userName, userColor, lastTs }>` and clear entries whose
  `lastTs` is older than e.g. 3–5s (client-side timeout) — the server is
  stateless and won't tell you when a peer stopped moving.
- Listen for `cursor:clear` (and `disconnect`-driven `cursor:clear`) to remove
  a user's cursor immediately.

## Done
Service restarted cleanly on :3003, build clean, no per-emit spam, all
existing behavior (room:join, board:update, activity:log, presence:set,
heartbeat, voting, focus:set/clear) untouched.
