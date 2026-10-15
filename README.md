# MyDay

MyDay — a no-frills daily planner: today's tasks and notes together, end-of-day carry-forward, and a minimal month view. Works offline. A Kasah Kod app.

Live at **https://myday.kasahkod.cc**. Pushing to `main` deploys it (Cloudflare Workers Builds).

## Install it as an app

- **iPhone / iPad:** open the address in Safari → Share → Add to Home Screen.
- **Mac:** Chrome (install icon in the address bar) or Safari (File → Add to Dock).

When a new version is deployed, the open app shows "A new version of MyDay is ready".
Tap **Refresh** to switch.

## Run it locally

Needs Node 22.12 or later.

```sh
npm install
npm run dev              # app at http://localhost:5173
npm run dev -- --host    # also reachable from iPhone/iPad on the same Wi-Fi
npm run build            # production build into dist/
```

The API and its database (Cloudflare Worker + D1), locally:

```sh
cp .dev.vars.example .dev.vars   # once, then fill in the sign-in secrets
npm run db:migrate:local         # once, and after adding a migration
npm run build && npm run dev:api # app + API at http://localhost:8787
```

While `dev:api` runs, `npm run dev` forwards `/api` to it. Test sign-in on
http://localhost:8787/signin (the address in `BETTER_AUTH_URL`).

## Database

Changes to the database are SQL files in `migrations/`. Apply a new one to the live
database with `npm run db:migrate:production`. Never edit one that's been applied; add a new one.

D1 keeps 30 days of history. To restore the live database to a point in time:

```sh
npx wrangler d1 time-travel restore myday-production --timestamp=2026-10-14T09:00:00Z
```

## Where things live

| Path | What |
| --- | --- |
| `index.html`, `src/styles.css`, `src/app.js` | The app |
| `src/store/` | On-device storage (IndexedDB) |
| `src/sw.js`, `src/pwa.js` | Offline support and the "new version" prompt |
| `worker/` | The API (Cloudflare Worker) |
| `migrations/` | Database schema |
| `wrangler.jsonc` | Worker and database config |
| `public/` | Manifest and icons |
| `CLAUDE.md` | Project brief for Claude Code |

Design: [MyDay — App Design](https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT) in Figma.
