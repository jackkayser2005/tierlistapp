# Ranked

A private friend-group tier-list app built with Next.js. Admins can upload people, create or edit lists with 2–8 custom tiers, and switch between live voting and results. Votes and rankings persist in the browser and synchronize between tabs on the same origin.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to the existing Vercel project

The repository needs no `vercel.json`; Vercel's Next.js defaults are the correct configuration.

```bash
npm run check
npm run lint
npm run build
npx vercel@50.28.0 link --yes --project rankforge --scope test11res
npx vercel@50.28.0 --prod
```

If the GitHub repository is already connected to `test11res/rankforge`, pushing `main` runs the same production deployment automatically.

## Multiplayer status

This fresh frontend does not use the deleted Socket.IO service. The prior project expected `NEXT_PUBLIC_ROOM_SERVICE_URL` from a separately hosted Render or Railway service, but its real URL was not stored in Git. Until a shared backend is reattached, each browser has its own room data.
