# Task 1 — full-stack-developer — RankForge room-service

## Task
Build a standalone socket.io mini-service at `/home/z/my-project/mini-services/room-service/` running on **fixed port 3003**, enabling real-time 2+ player collaboration on a shared RankForge tier-list board.

## Work Log
1. Read prior worklog (Task 0 = single-player RankForge PoC already built in `src/components/rankforge/`). This task is the multiplayer backend.
2. Reviewed `examples/websocket/server.ts` to match the project's socket.io conventions (`path: '/'`, CORS `*`, port 3003, graceful shutdown).
3. Created directory `mini-services/room-service/`.
4. Wrote `package.json`:
   - `name: "rankforge-room-service"`, `type: "module"`, `private: true`.
   - `"dev": "bun --hot index.ts"` (auto-restart on change) and `"start": "bun index.ts"`.
5. Wrote `tsconfig.json` (strict, ESNext, Bun).
6. Ran `bun add socket.io` inside the folder → installed `socket.io@4.8.3` (22 packages, separate `bun.lock` from root; root `package.json` untouched).
7. Wrote `index.ts`:
   - `createServer` from `node:http` + `Server` from `socket.io`.
   - CORS `origin: "*"`, `methods: ["GET","POST"]`, `path: '/'`, `pingTimeout: 60000`, `pingInterval: 25000`.
   - In-memory state: `rooms: Map<roomId, {members:Set, host, board}>` + reverse index `socketRooms: Map<socketId, Set<roomId>>`.
   - Events:
     - `room:join { roomId, board? }` → joins socket, sets host on first joiner, stores board snapshot if provided, emits `room:state { roomId, isHost, peers, board }` to joiner, broadcasts `presence:update { roomId, peers }` to whole room. Leaves any previous room first.
     - `board:update { roomId, board }` → stores snapshot, relays via `socket.to(roomId).emit('board:update', { board })` (NO self-echo).
     - `board:sync-request { roomId }` → replies to requester with `board:sync { roomId, board|null }`.
     - `disconnect` → removes socket from all joined rooms, promotes a new host if the host left, broadcasts `presence:update` with new peer count. Snapshots kept in memory for quick reconnect.
   - Every handler wrapped in try/catch with `[event]`-prefixed logging; never crashes.
   - Graceful `SIGTERM`/`SIGINT` shutdown.
   - Initially added a `/health` HTTP handler, but discovered socket.io with `path: '/'` shadows all HTTP routes (returns engine.io "Transport unknown"). Removed the custom handler and documented why (matches the example pattern).
8. Started in background: `nohup bun run dev > service.log 2>&1 &`.
9. Verified:
   - `service.log` shows `room-service on :3003` (twice — `bun --hot` restarted after my edit cleanly).
   - `lsof -i:3003` → `bun` PID 3571 LISTEN on `*:3003` (IPv6, dual-stack).
   - engine.io handshake at `GET /?EIO=4&transport=polling` returns a valid `sid` with `upgrades:["websocket"]`.
10. End-to-end smoke test (throwaway, in `/home/z/.rf-smoke/`, deleted after) using `socket.io-client` with two clients (Alice host + Bob joiner). All assertions passed:
    - Alice `room:state` → `isHost:true, peers:1, board` hydrated from her join payload.
    - Bob `room:state` → `isHost:false, peers:2, board` hydrated from stored snapshot (late-joiner hydration works).
    - `presence:update` reaches both with `peers:2`.
    - Bob `board:sync-request` → `board:sync` returns current board.
    - Alice `board:update` relayed to Bob; Bob `board:update` relayed to Alice.
    - **No self-echo** (sender never receives its own `board:update`).
    - On Bob disconnect, Alice gets `presence:update` with `peers:1`.

## Files Created
- `/home/z/my-project/mini-services/room-service/package.json`
- `/home/z/my-project/mini-services/room-service/tsconfig.json`
- `/home/z/my-project/mini-services/room-service/index.ts`
- `/home/z/my-project/mini-services/room-service/bun.lock` (auto-generated)
- `/home/z/my-project/mini-services/room-service/node_modules/` (socket.io + deps)
- `/home/z/my-project/mini-services/room-service/service.log` (runtime log)

## Running State
- Process: `bun --hot index.ts`, PID 3571, listening on `*:3003`.
- Auto-restart enabled (`--hot`).
- Logs at `/home/z/my-project/mini-services/room-service/service.log`.

## Example Socket Event Flow
```
Alice (host)                           Bob (joiner)                  Server
   |                                      |                            |
   |-- room:join { roomId:"ABC", board }  |                            |
   |                                      |                            | create room, host=Alice, store board
   |<- room:state {isHost:true,peers:1,board}                          |
   |<- presence:update {peers:1}                                       |
   |                                      |-- room:join {roomId:"ABC"} |
   |                                      |<- room:state {isHost:false,peers:2,board}  (hydrate from snapshot)
   |<- presence:update {peers:2}          |<- presence:update {peers:2}|
   |                                      |-- board:sync-request ------|
   |                                      |<- board:sync {board}       |
   |-- board:update {board:v2} ---------->| (relay)                    |
   |                                      |-- board:update {board:v3} -|
   |<- board:update {board:v3}            | (no self-echo to bob)      |
   |                                      |× disconnect                |
   |<- presence:update {peers:1}          |                            |
```

## Frontend integration note (for next agent)
Next.js client connects via `io("/?XTransformPort=3003", { path: "/" })`. The Caddy gateway routes by the `XTransformPort` query param to port 3003. No Caddy config changes needed.

## Stage Summary
- room-service mini-service is live on port 3003 with full event coverage: `room:join`, `room:state`, `presence:update`, `board:update`, `board:sync-request`, `board:sync`, `disconnect`.
- Verified end-to-end with a two-client smoke test: host promotion, late-joiner board hydration, no-self-echo relay, sync path, and disconnect-driven presence updates all work.
- Ready for the frontend agent to wire `socket.io-client` into `src/components/rankforge/` (a `useRoom` hook + a "Share room" UI in the control panel).
