# MyDay — project brief for Claude Code

MyDay is Amin's personal daily to-do app, used every day. It replicates his paper
schedule: a ruled "exercise-book" task page beside a notes pane, with an end-of-day
carry-forward (cf) ritual and a minimal month view. It is a **task app with a calendar**,
not a calendar with events. Part of the Kasah Kod studio (productivity group, alongside
Beli Grocery and Quran Daily).

Until now it ran as a Claude artifact (`legacy/myday-artifact.html`, single file,
~68 KB) using the artifact's built-in DB for sync. This project moves it to its own
codebase so it works as an installable mobile app synced across MacBook, iPhone and iPad.

## Goal of this migration
1. Same app, same look and behaviour — port, don't redesign.
2. Installable on iPhone/iPad home screen and Mac (PWA), works offline.
3. Syncs across devices via our own backend on Cloudflare.
4. Import existing data from `migration/myday-export-2026-10-14.json`.

No App Store release planned yet. If that changes later, wrap the PWA with Capacitor.

## Target stack (keep it lean)
- **Frontend:** the existing vanilla HTML/CSS/JS, split into `index.html`, `styles.css`,
  `app.js`. No framework unless there's a strong reason. Vite is fine for dev/build.
- **PWA:** `manifest.webmanifest` (name "MyDay", standalone, ruled-page-with-tick icon),
  service worker caching the app shell, `apple-touch-icon` + iOS meta tags,
  safe-area insets (already handled in the CSS).
- **Local store:** IndexedDB as the source of truth on each device (offline-first).
- **Backend:** Cloudflare Pages (static) + Pages Functions / Worker API + **D1**.
- **Auth:** single user for now → protect the whole site with **Cloudflare Access**
  (email one-time PIN to aminrahman@gmail.com). Worker reads the Access JWT
  (`Cf-Access-Authenticated-User-Email`) as the user id. Design the schema with a
  `user_id` column so real multi-user auth can be added later if MyDay goes public.
- **Hosting:** GitHub repo → Cloudflare Pages, subdomain `myday.kasahkod.cc`.

## Data model (matches the legacy artifact — keep these shapes)
Day document, keyed by ISO date `YYYY-MM-DD`:
```json
{ "date": "2026-10-13", "dayNote": "<html>", "updatedAt": "ISO",
  "tasks": [{ "id": "wialh1mq", "text": "", "status": "open|done|missed|cf",
              "reason": "", "note": "<html>", "from": null, "carried": null }] }
```
Week note, keyed by week-start date (Monday): `{ "note": "<html>" }`.
Notes are contentEditable HTML (bold, h3, lists, checklists `ul.chk li[data-done]`, links).

Suggested D1 tables:
- `days(user_id, date, body JSON, updated_at, PRIMARY KEY(user_id, date))`
- `weeks(user_id, week_start, note TEXT, updated_at, PRIMARY KEY(user_id, week_start))`

## Sync design
- Every edit writes to IndexedDB immediately and marks the doc dirty (keep the existing
  ~500 ms debounce in `changed()` / `flush()`).
- A sync loop pushes dirty docs (`PUT /api/days/:date`, `PUT /api/weeks/:start`) and
  pulls changes (`GET /api/changes?since=<cursor>`). Run on load, on focus/visibilitychange,
  on reconnect, and every ~30 s while visible.
- Conflict rule: whole-document last-write-wins by `updatedAt`, server timestamp as
  tiebreak. Acceptable because one person edits one day at a time. Never drop a newer
  local edit silently — if the server is newer while local is dirty, keep both
  (e.g. stash the losing version) and log it.
- Footer status replaces "Synced to your Claude account": show "Synced", "Offline —
  saved on this device", or "Sync error".
- The legacy code already abstracts storage in `getDay / putDay / queryDays` and the
  week-note functions (`ensureWeekNote`, `flushWeek`) — swap those for the new
  IndexedDB + sync layer rather than rewriting the UI. Remove the `window.claude`
  boot path and the `onSnapshot` listeners (replace with the pull loop).
- Keep the midnight roll-over and the existing localStorage UI prefs (`dp:view`,
  `dp:pane`, `dp:scope`) — those are per-device and don't need syncing.

## Import
One-off: `migration/myday-export-2026-10-14.json` has `{ days: {date: dayDoc},
weeks: {weekStart: {note}} }` (5 days, 2 weeks). Provide either a script
(`wrangler d1 execute`) or a hidden Settings → Import JSON in the app. Also add
**Export JSON** in Settings as a backup.

## Build order
1. Split legacy file into index.html / styles.css / app.js; confirm it runs locally
   with localStorage mode exactly as before.
2. Replace storage with IndexedDB; add manifest, icons, service worker. Test install
   on iPhone Safari (Share → Add to Home Screen).
3. Worker API + D1 schema + migrations; wrangler config.
4. Sync loop + status footer; test two devices editing offline then reconnecting.
5. Cloudflare Access in front of the site; import data; deploy to myday.kasahkod.cc.

## Conventions
- Amin works in VS Code with Claude Code, commits to GitHub, deploys via Cloudflare.
- Keep it no-frills: no reminders/notifications, no extra features during the port.
- Design tokens live in `:root` (paper, ink, pen blue, margin red, Young Serif /
  IBM Plex Sans / IBM Plex Mono); keep light + dark themes intact. Kasah Kod shared
  design system work happens in Figma — don't restyle here.
