# MyDay

MyDay — a no-frills daily planner: today's tasks and notes together, end-of-day carry-forward, and a minimal month view. Offline-first, synced across devices. A Kasah Kod app.

## Run it

Needs Node 22.12 or later.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run dev -- --host   # also reachable from iPhone/iPad on the same Wi-Fi
npm run build      # production build into dist/
npm run preview    # serve the built dist/ locally
npm test           # unit tests (Vitest)
```

### The API and database locally

The API is a Cloudflare Worker (`worker/`) with a D1 database. Locally it runs on
Wrangler with a SQLite copy of the database in `.wrangler/`.

```sh
cp .dev.vars.example .dev.vars   # once: signs local API requests in as a dev user
npm run db:migrate:local         # once, and after adding a migration
npm run build                    # the Worker serves dist/, so build first
npm run dev:api                  # app + API at http://localhost:8787
```

While `dev:api` runs, `npm run dev` (port 5173) forwards `/api` to it.
Until sign-in is built, a deployed API answers "Sign in required" to every data request.

## Deploying

Cloudflare Workers Builds deploys from GitHub:

| Branch | Deploys | Database | Command |
| --- | --- | --- | --- |
| `main` | the `myday` Worker (production) | `myday-production` | `npx wrangler deploy` |
| any other | a preview of `myday` for that branch | `myday-preview` | `npx wrangler preview` |

The preview database is set in the `previews` block of `wrangler.jsonc`, so previews
never touch production data.

Build command for both: `npm run build`.

Database changes are SQL files in `migrations/`, applied with
`npm run db:migrate:preview` and then `npm run db:migrate:production`. Never edit a
migration that has been applied; add a new one.

### Backups

D1 keeps 30 days of history (Time Travel). To restore production to a point in time:

```sh
npx wrangler d1 time-travel info myday-production --timestamp=2026-10-14T09:00:00Z
npx wrangler d1 time-travel restore myday-production --timestamp=2026-10-14T09:00:00Z
```

## Install it as an app

The service worker only runs in a production build, and only over HTTPS (or on `localhost`).

- **Mac:** `npm run build && npm run preview`, open http://localhost:4173 in Chrome (install
  icon in the address bar) or Safari (File → Add to Dock).
- **iPhone / iPad:** needs an HTTPS address. Open it in Safari → Share → Add to Home Screen.

After a new build is deployed, the open app shows "A new version of MyDay is ready".
Tap **Refresh** to switch.

## Where things live

| Path | What |
| --- | --- |
| `index.html` | App markup |
| `src/styles.css` | All styles; design tokens live in `:root` |
| `src/app.js` | App logic and rendering |
| `src/store/` | On-device storage (IndexedDB) |
| `worker/` | The API (Cloudflare Worker): routes, validation, database queries, tests |
| `migrations/` | D1 database schema, one SQL file per change |
| `wrangler.jsonc` | Worker, assets and database config for production and branch previews (`wrangler.preview-db.jsonc` is only for preview migrations) |
| `src/sw.js`, `src/pwa.js` | Service worker (offline + updates) and its registration; `vite.config.js` builds `dist/sw.js` |
| `public/` | Static files copied as-is into the build: `manifest.webmanifest`, `favicon.ico`, `icons/` |
| `resources/icon-1024.png` | App icon master (not shipped; for a future native wrap) |
| `legacy/myday-artifact.html` | The original single-file Claude artifact, kept for reference |
| `CLAUDE.md` | Project brief for Claude Code: stack, design, data model, sync, build order |

## Design

The app is moving to a new look, **Clear day**. The Figma file is the source of truth:
[MyDay — App Design](https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT).

## Status

Data is stored on each device in IndexedDB and works fully offline, with no account.
Anything saved by the earlier localStorage version is moved over automatically on first launch.
Cross-device sync and the new design arrive in later build steps (see `CLAUDE.md`).
