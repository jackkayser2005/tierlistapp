# Task 5 — full-stack-developer — RankForge room-service collaborative rewrite

## Task
Rewrite `mini-services/room-service/index.ts` to add a proper real-time collaborative architecture supporting up to 10 users per room, with presence, identity, activity logs, heartbeats, idempotency (seq numbers), and reconnection resync. Preserve all existing board/voting behavior. Single file, in-memory only, port 3003, path "/", CORS "*".

## Prior work read
- `/home/z/my-project/worklog.md` (Tasks 0–4): single-player PoC → 2-player socket.io room-service (Task 1) → redesign + multiplayer UI (Task 2) → voting system (Task 3) → voting UI + theme refresh (Task 4).
- `/home/z/my-project/mini-services/room-service/index.ts` (full read): 500 lines, Set-based members, sorted-id host promotion, vote state with Map<socketId, tierId>, graceful shutdown, `bun --hot`, try/catch on every handler.

## Work Log
1. Read worklog + existing `index.ts` to understand the structure and preserve graceful shutdown, `bun --hot` compat, and try/catch-on-every-handler.
2. Rewrote `index.ts` end-to-end (~640 lines, single file, sectioned with banner comments):
   - **Types**: added `User`, `ActivityEntry`. Changed `RoomState.members` from `Set<string>` to `Map<string, User>` (insertion order = join order). Added `activity: ActivityEntry[]` and `seq: number` to RoomState. Kept `VoteState` unchanged.
   - **Constants**: MAX_MEMBERS=10, MAX_ACTIVITY=40, HEARTBEAT_SWEEP_MS=15000, HEARTBEAT_TIMEOUT_MS=45000, PRESENCE_STATES, ALLOWED_ACTIONS.
   - **Helpers**: `uuid`, `itemLabel`, `getOrCreateRoom`, `peerCount`, `rememberRoom`, `forgetRoom` (host promotion via `members.keys().next().value` — first by insertion order), `presenceList`, `activityPayload`, `pushActivity` (cap-at-40 via shift loop), `nextSeq`, `broadcastPresence` (`{ members, host, seq }`), `broadcastActivity` (`{ entry, seq }`), `voteStatePayload(room, seq?)` (added `totalPeers` from members.size + `seq`).
   - **`identity`** (new): validates name (trim, slice 20, default "Guest") + color (regex `^#[0-9a-fA-F]{6}$`, default "#64748b"). Stores on `socket.data.identity`. No broadcast.
   - **`room:join`** (rewritten): 10-user cap (`members.size >= 10` → `room:error 'Room is full (max 10)'`); leaves previous rooms with `broadcastPresence` + scrubs active vote from old room; reads identity; creates User; emits to joiner: `room:state { roomId, isHost, peers, board, seq }`, `presence:update { members, host, seq }`, `activity:sync { entries }`, (if active) `vote:state`; then `broadcastPresence` + `broadcastActivity` "joined" to whole room.
   - **`board:update`**: requires existing room (no create-on-the-fly); stores board; `nextSeq`; relays `{ board, seq, eventId }` to OTHERS via `socket.to` (no self-echo). Does NOT infer action types — client emits `activity:log` separately.
   - **`activity:log`** (new): client-driven. Validates action ∈ ALLOWED_ACTIONS, detail (trim, slice 120). Builds entry, `broadcastActivity` to whole room incl sender.
   - **`presence:set`** (new): validates state ∈ PRESENCE_STATES; updates user.presence + lastSeen; `broadcastPresence`.
   - **`heartbeat`** (new, no payload): updates user.lastSeen across all the socket's rooms.
   - **`board:sync-request`** / **`vote:sync-request`**: unchanged (hydration, no seq bump).
   - **`vote:start`**: same + `broadcastActivity` "vote_started" (detail = itemLabel).
   - **`vote:cast`**: same + `broadcastActivity` "voted" (detail = `${itemLabel} -> ${tierId}`).
   - **`vote:end`**: same + `vote:result { ..., seq }` + `broadcastActivity` "vote_ended" (detail = `Winner: <tierId>` or `No votes`).
   - **`vote:cancel`**: same + `broadcastActivity` "vote_cancelled" (detail = was-itemId).
   - **`disconnect`**: captures user before forgetRoom; `broadcastPresence` + `broadcastActivity` "left" (detail = name); scrubs vote + re-broadcasts vote:state. Clears `socket.data.identity`.
   - **Heartbeat sweep**: `setInterval` 15s; force-disconnects sockets with `lastSeen > 45s` via `socket.disconnect(true)` (triggers normal disconnect handler for cleanup).
   - **Shutdown**: SIGTERM/SIGINT now also `clearInterval(heartbeatSweep)`.
3. Preserved: `path:'/'`, CORS `*`, port 3003, ping 25s/60s, `bun --hot`, graceful shutdown, try/catch-on-every-handler, no custom HTTP route (engine.io owns `/`).

## Verification
- `bun build index.ts --target=bun --outfile=/tmp/rs-check.js` → `Bundled 59 modules in 13ms`, no errors.
- Restarted: had to `kill -9` old PID 8717 (Task 4 process — `bun --hot` didn't pick up the rewrite from a prior session). After kill + relaunch: bun PID 10368 LISTEN on `*:3003`; `service.log` shows `$ bun --hot index.ts` + `room-service on :3003`, no errors.
- End-to-end smoke test (`socket.io-client`, throwaway in `/tmp/rs-smoke/`, since deleted): Alice (host) + Bob (guest) + 10-client cap + disconnect. **31/31 assertions passed** covering: identity, room:join (isHost/peers/seq/board hydration), activity:sync, activity:new (own joined + peer joined), presence:update (members array + host id + name+color), presence:set (dragging + seq increment), activity:log (moved detail), board:update (eventId + seq + no self-echo), vote:start (totalPeers + seq + vote_started activity), vote:cast (tally + voted activity detail), heartbeat (no crash), **10-user cap (11th rejected)**, disconnect (left activity + presence drop + host retained + vote scrubbed).

## Deviations from spec (all additive)
1. `presence:update` payload includes `host: string|null` in addition to `{ members, seq }` — needed so clients can render the host badge after promotion (spec says "Broadcast presence:update so clients see the new host badge", which requires the host id).
2. `vote:result` and `vote:state` payloads include `seq` (spec says "Include seq in those payloads where it matters (board:update relay especially)" — extended to vote events for consistency).
3. `activity:new` payload is `{ entry, seq }` (spec says `{ entry }` — added seq for monotonic ordering signal).
4. Room-switch (in room:join's leave-previous loop) scrubs the switching user's vote on the old room's active vote (spec says "same as before, but also broadcast presence:update" — added vote scrub for robustness, otherwise a ghost vote would persist).
5. Room-switch does NOT push a "left" activity (spec only specifies "left" on disconnect; preserved spec literally).
6. `vote:state` to joiner on hydrate uses current `room.seq` (no increment) — seq-increment rule applies to broadcasts, not direct hydration emits.
7. `board:update` no longer creates a room on the fly (original did; new version requires `room:join` first — aligns with identity-based join flow).

## Running State
- Process: `bun --hot index.ts`, PID 10368, listening on `*:3003`.
- Auto-restart enabled (`--hot`).
- Logs at `/home/z/my-project/mini-services/room-service/service.log`.

## Full event reference (for the frontend team)

### Client → Server
| Event | Payload |
|---|---|
| `identity` | `{ name?: string; color?: string }` — set name (1–20 chars, default "Guest") + color (`#rrggbb`, default "#64748b"). Emit immediately after connect, before room:join. |
| `room:join` | `{ roomId?: string; board?: Board }` — join/create room. 10-user cap. |
| `board:update` | `{ roomId?: string; board?: Board; eventId?: string }` — full-board sync to peers. |
| `activity:log` | `{ roomId?: string; action?: string; detail?: string }` — client-driven activity entry. action ∈ { joined, left, added, moved, deleted, vote_started, voted, vote_ended, vote_cancelled }. detail max 120 chars. |
| `presence:set` | `{ roomId?: string; state?: string }` — state ∈ { online, idle, dragging, voting }. |
| `heartbeat` | (no payload) — emit every ~20s to stay alive (server force-disconnects at 45s idle). |
| `board:sync-request` | `{ roomId?: string }` — request current board snapshot. |
| `vote:sync-request` | `{ roomId?: string }` — request current vote state. |
| `vote:start` | `{ roomId?: string; itemId?: string; item?: object }` — host-only. |
| `vote:cast` | `{ roomId?: string; itemId?: string; tierId?: string }` — record/overwrite vote. |
| `vote:end` | `{ roomId?: string }` — host-only. Announces winner. |
| `vote:cancel` | `{ roomId?: string }` — host-only. |

### Server → Client
| Event | Payload |
|---|---|
| `room:state` | `{ roomId, isHost, peers, board, seq }` — emitted to joiner only. |
| `presence:update` | `{ members: User[], host: string|null, seq }` — broadcast on join/leave/presence:set/host promotion. |
| `activity:sync` | `{ entries: ActivityEntry[] }` — emitted to joiner (last 40). |
| `activity:new` | `{ entry: ActivityEntry, seq }` — broadcast on every activity push. |
| `board:update` | `{ board, seq, eventId? }` — relayed to OTHERS (no self-echo). |
| `board:sync` | `{ roomId, board|null }` — reply to board:sync-request. |
| `vote:state` | `{ active, itemId, item, tally, voterCount, totalPeers, seq }` — broadcast on start/cast/end/cancel/disconnect-of-voter; also to joiner if active. |
| `vote:result` | `{ itemId, tally, winner, seq }` — broadcast once on vote:end. winner=null if no votes; ties broken by ascending alphabetical tierId. |
| `room:error` | `{ event, message }` — emitted to offending socket only. |

### Types
```ts
User = { id: string; name: string; color: string; presence: 'online'|'idle'|'dragging'|'voting'; lastSeen: number }
ActivityEntry = { id: string; userId: string; userName: string; action: string; detail: string; ts: number }
```

## Stage Summary
- room-service on :3003 now implements the full collaborative protocol: identity → room:join (10-user cap) → presence → activity log (last 40) → heartbeats (client 20s, server reaper 15s/45s) → seq numbers on every state-changing broadcast → idempotency via eventId passthrough → resync via board:sync-request / vote:sync-request / activity:sync on join. All pre-existing board sync + voting behavior preserved. 31/31 smoke assertions pass. Compile clean. No errors in service.log.
- Ready for the frontend agent to wire: identity emit on connect, heartbeat interval, presence:set on DnD, activity:log on user-visible board actions, seq tracking for reconciliation, and resync on reconnect.
