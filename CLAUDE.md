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

**Scope decision (14 Oct 2026):** stay a PWA for now, no App Store prep — but build it
to store-ready standards (real in-app sign-in, account deletion, privacy page, offline,
native feel) so wrapping it with Capacitor later is a small step, not a rewrite.
Every Kasah Kod app follows this same baseline.

## Target stack (keep it lean)
- **Frontend:** the existing vanilla HTML/CSS/JS, split into `index.html` (repo root),
  `src/styles.css` and `src/app.js`. Vite for dev/build (output `dist/`). No UI framework;
  add a dependency only when it clearly earns its place, and say why.
- **PWA:** `manifest.webmanifest` (name "MyDay", standalone, ruled-page-with-tick icon),
  service worker caching the app shell, `apple-touch-icon` + iOS meta tags,
  safe-area insets (already handled in the CSS).
- **Local store:** IndexedDB as the source of truth on each device (offline-first).
- **Backend:** Cloudflare Pages (static) + Pages Functions / Worker API + **D1**.
- **Auth:** real in-app sign-in (NOT Cloudflare Access — that can't live inside a
  future native wrapper). Use **Better Auth** on the Worker with D1 as its store:
  - Email **magic link** as the primary method (send via Resend's free tier).
  - **Passkeys** as an optional add-on after first sign-in (Face ID / Touch ID).
  - Sessions in an HttpOnly, Secure, SameSite=Lax cookie; long-lived (~60 days,
    sliding) so the installed app rarely asks to sign in again.
  - If Google sign-in is ever added, Sign in with Apple must be added too.
  - Multi-user from day one: every row keyed by `user_id`; the API only ever
    reads/writes the signed-in user's rows.
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

## Store-ready baseline (applies to every Kasah Kod app)
- **Account:** sign in, sign out (this device / all devices), change email,
  **delete account** (removes all server data, confirmed with a typed prompt).
- **Your data:** Export JSON, Import JSON. Signed-out use works locally; on first
  sign-in, offer to upload local data to the account.
- **Settings screen:** account, theme (system/light/dark), export/import, version +
  build number, "What's new", support email, privacy policy link.
- **Legal pages:** `/privacy` and `/terms` (plain, short, honest: what's stored, where,
  no tracking, how to delete). Studio-wide versions can live on kasahkod.cc later.
- **Offline & updates:** app shell cached; every screen usable offline; service worker
  shows "New version available — Refresh" instead of silently swapping code.
- **Native feel:** standalone display, safe areas, no zoom-on-input (16px inputs),
  no text-selection on chrome, 44px touch targets, Kasah Kod → Amin Digital splash,
  full icon set (maskable + apple-touch-icon), iOS splash screens.
- **Security:** API validates every input (zod), rate-limits auth endpoints, CSP and
  security headers via `_headers`, secrets only in `wrangler secret`, never in repo.
- **Privacy-friendly analytics only:** Cloudflare Web Analytics (cookieless) or none.
- **Accessibility:** keyboard reachable, visible focus, labels on icon buttons,
  respects reduced-motion, contrast checked in both themes.
- **Reliability:** separate `preview` and `production` environments (own D1 each);
  D1 Time Travel noted as the backup/restore path; schema changes only via migrations.
- **Quality:** Vitest for the sync/merge logic, Playwright smoke test (sign in → add
  task → reload offline → still there); GitHub Actions runs them on every PR.
- **Versioning:** semver in package.json, shown in Settings; CHANGELOG.md.

## Build order
1. **Repo setup:** Vite project, split legacy file into index.html / src/styles.css /
   src/app.js; confirm it runs locally exactly as before. Add README, .gitignore,
   CHANGELOG, .editorconfig, package.json at 0.1.0.
2. **Local-first:** replace storage with IndexedDB behind the existing
   getDay/putDay/queryDays functions. App fully works signed-out.
3. **PWA:** manifest, icon set, splash, service worker with update prompt. Test
   "Add to Home Screen" on iPhone and iPad, and install on Mac.
4. **Backend:** Worker API + D1 schema + migrations; wrangler config with preview
   and production environments.
5. **Sign-in:** Better Auth (magic link via Resend), session cookie, sign-in screen
   in the MyDay style, sign out, then passkeys.
6. **Sync:** push/pull loop, conflict rule, status footer; test two devices editing
   offline then reconnecting.
7. **Account & data:** Settings screen, export/import, upload-local-data-on-first-
   sign-in, delete account, privacy + terms pages.
8. **Hardening:** validation, rate limits, security headers, accessibility pass,
   tests + GitHub Actions.
9. **Launch:** deploy to myday.kasahkod.cc, sign in, import
   `migration/myday-export-*.json` (ask for a fresh export from the artifact on
   cutover day), use it for a week, then retire the artifact.

## How we work
- MyDay is used every day — treat it as a real product, not a prototype.
- One build step at a time. Each step gets its own branch (`step-1-repo-setup`,
  `step-2-local-first`, …) with small, clear commits, and a PR into `main` when done.
  Amin reviews and merges.
- At the end of each step, stop and report: what changed, how to test it on his
  devices, what's next.
- Decisions that are Amin's (naming, paid services, trade-offs): ask, don't guess.
- Keep this file current: if a decision changes, update it in the same PR.

## Data safety
- The GitHub repo (`PejabatDigital/myday`) is **public**. `migration/` holds real tasks
  and notes and is git-ignored — never commit exports, D1 dumps or `.dev.vars`.
- Secrets live only in `wrangler secret` / git-ignored `.dev.vars`.

## Conventions
- Amin works in VS Code with Claude Code, commits to GitHub, deploys via Cloudflare.
- Keep it no-frills: no reminders/notifications, no extra features during the port.
- Design tokens live in `:root` (paper, ink, pen blue, margin red, Young Serif /
  IBM Plex Sans / IBM Plex Mono); keep light + dark themes intact. Kasah Kod shared
  design system work happens in Figma — don't restyle here.
