# RankForge — Deployment Guide

RankForge has two parts that need hosting:
1. **Frontend** (Next.js app) → Vercel (easiest, free)
2. **Backend** (socket.io room service) → Render or Railway (free tier)

You need BOTH running somewhere for multiplayer to work. Solo mode (no server) works without any hosting.

---

## Step 1 — Deploy the backend (5 minutes)

The room service is a tiny Node/Bun server in `mini-services/room-service/`.

### Option A: Render (recommended, easiest)

The room-service now runs on plain **Node** (via `tsx`) and binds to Render's
`$PORT` automatically — no code changes needed.

1. Push your project to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service.
3. Connect your GitHub repo.
4. Settings:
   - **Root Directory**: `mini-services/room-service`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`  (runs `tsx index.ts`)
   - **Plan**: Free
5. Deploy. You'll get a URL like `https://rankforge-room.onrender.com`.
6. Note that URL — you'll need it in Step 2.

### Option B: Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Select the repo, set root directory to `mini-services/room-service`.
3. Railway auto-detects Bun. Set start command to `bun run index.ts`.
4. Deploy. Note the generated URL.

### Option C: Fly.io

```bash
cd mini-services/room-service
fly launch --no-deploy
fly deploy
```

---

## Step 2 — Deploy the frontend to Vercel (3 minutes)

1. Go to [vercel.com](https://vercel.com) → New Project.
2. Import your GitHub repo.
3. Vercel auto-detects Next.js — default settings work.
4. **Add an environment variable**:
   - Name: `NEXT_PUBLIC_ROOM_SERVICE_URL`
   - Value: your backend URL from Step 1 (e.g. `https://rankforge-room.onrender.com`)
5. Deploy. You'll get a URL like `https://rankforge.vercel.app`.

### The socket URL is already wired up

No code change is needed. `src/lib/socket.ts` reads
`NEXT_PUBLIC_ROOM_SERVICE_URL` automatically:

- When the env var **is set** (production on Vercel), it connects **directly** to
  your hosted backend and prefers the **websocket** transport first for the
  lowest latency (falling back to long-polling only if WS is blocked).
- When the env var is **not set** (local dev), it connects through the Caddy
  gateway (`/?XTransformPort=3003`) **polling-first**, because the local gateway
  does not reliably forward the WebSocket upgrade. socket.io still upgrades to
  WS opportunistically.

So the only production step is setting `NEXT_PUBLIC_ROOM_SERVICE_URL` in Vercel
(Step 2 above) — the client picks the right transport on its own.

---

## Step 3 — Share and play

1. Open your Vercel URL.
2. Click "Start a live room" — get a room code.
3. Copy the share link, send to up to 9 friends.
4. They open the link, pick a name/color, and join.
5. Host starts a vote, everyone votes, item gets placed.

---

## Does it HAVE to be hosted?

**No.** The app works fully offline in solo mode:
- Create tiers, add items, drag cards, vote locally (1 player)
- localStorage persistence
- PNG export
- JSON import/export

Multiplayer is the only feature that needs the backend. If the room service
isn't running, the "Start a live room" button just won't connect — everything
else works.

---

## Free tier limits (2026)

| Service | Free tier | Limits |
|---------|-----------|--------|
| Vercel | Hobby (free) | 100GB bandwidth/mo, unlimited static |
| Render | Free web service | 750 hours/mo, sleeps after 15min idle |
| Railway | $5 free credit | ~500 hours of a small service |
| Fly.io | Free allowance | 3 shared-cpu VMs |

For a friend group of 10 people using it occasionally, Render's free tier is
more than enough. The service sleeps when idle (first request after sleep takes
~30s to wake), but socket.io connections are persistent so it won't sleep
during active use.
