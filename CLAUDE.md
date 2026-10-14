# MyDay — project brief for Claude Code

MyDay is Amin's personal daily to-do app, used every day. It started as a copy of his
paper schedule: a task list beside notes, an end-of-day carry-forward ritual, and a
minimal month view. It is a **task app with a calendar**, not a calendar with events.
Part of the Kasah Kod studio (productivity group, alongside Beli Grocery and Quran Daily).

It first ran as a Claude artifact (`legacy/myday-artifact.html`, single file, ~68 KB)
using the artifact's built-in DB for sync. This project moves it to its own codebase so
it works as an installable app synced across MacBook, iPhone and iPad.

## Goals
1. **Keep the behaviour, change the look.** The logic in the legacy app works and is
   used daily — keep it. The visual design is being replaced with the new **Clear day**
   design (see Design below). The paper / exercise-book look is retired.
2. Installable on iPhone/iPad home screen and Mac (PWA), works offline.
3. Syncs across devices via our own backend on Cloudflare.
4. Import existing data from `migration/myday-export-2026-10-14.json`.

**Scope decision (14 Oct 2026):** stay a PWA for now, no App Store prep — but build it
to store-ready standards (real in-app sign-in, account deletion, privacy page, offline,
native feel) so wrapping it with Capacitor later is a small step, not a rewrite.
Every Kasah Kod app follows this same baseline.

## Target stack (keep it lean)
- **Frontend:** vanilla HTML/CSS/JS — `index.html` (repo root), `src/styles.css`,
  `src/app.js`. Vite for dev/build (output `dist/`). No UI framework; add a dependency
  only when it clearly earns its place, and say why. Splitting `app.js` into modules
  is fine once it helps (e.g. `src/store/`, `src/sync/`, `src/ui/`).
- **PWA:** `manifest.webmanifest` (name "MyDay", standalone), service worker caching
  the app shell, `apple-touch-icon` + iOS meta tags, safe-area insets.
- **Local store:** IndexedDB as the source of truth on each device (offline-first).
- **Backend:** one Cloudflare **Worker with static assets** (the built app from `dist/`)
  + the API in `worker/` (runs only for `/api/*`) + **D1**. Config: `wrangler.jsonc`.
  (Chosen 14 Oct 2026 over Pages: the repo was connected as a Worker, and it's
  Cloudflare's recommended path.)
- **Auth:** real in-app sign-in (NOT Cloudflare Access — that can't live inside a
  future native wrapper). Use **Better Auth** on the Worker with D1 as its store:
  - Email **magic link** as the primary method (send via Resend's free tier).
  - **Passkeys** as an optional add-on after first sign-in (Face ID / Touch ID).
  - Sessions in an HttpOnly, Secure, SameSite=Lax cookie; long-lived (~60 days,
    sliding) so the installed app rarely asks to sign in again.
  - If Google sign-in is ever added, Sign in with Apple must be added too.
  - Multi-user from day one: every row keyed by `user_id`; the API only ever
    reads/writes the signed-in user's rows.
- **Hosting:** GitHub repo → Cloudflare Workers Builds. `main` deploys the `myday` Worker
  (production, D1 `myday-production`); other branches get their own preview of
  `myday` (`wrangler preview`, the Workers Builds default) on D1 `myday-preview`, set in
  the `previews` block of `wrangler.jsonc`. Subdomain `myday.kasahkod.cc`.

## Design — Clear day
**Source of truth:** Figma file "MyDay — App Design"
https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT
If the Figma MCP server is connected, read variables, components and frames from it
(pages: Components, User Flows, Wireframes — Phone, Hi-fi). If not, use the values below.

**Direction:** modern and minimal. Amin Digital navy and blue on a cool off-white;
one typeface; round status marks; generous 56px rows with no dividers (space separates);
a floating Add Bar at the bottom; the **Day Line** under the date as the one signature
element. No paper texture, ruled lines, red margin, serif or monospace type.

### Tokens (CSS custom properties on `:root`, names match the Figma variables)
| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #F6F7F9 | #0B1020 | app background |
| `--surface` | #FFFFFF | #131A2E | cards, sheets, Add Bar, icon buttons |
| `--subtle` | #EEF1F6 | #1A2238 | secondary buttons, fields, chips |
| `--accent-soft` | #E8EEFF | #1A2550 | carried / suggested backgrounds, ID chips |
| `--danger-soft` | #FDECEC | #3A1A20 | missed tag, danger button |
| `--text` | #13204A | #E9ECF5 | primary text; also toast background (inverted) |
| `--text-muted` | #6B7389 | #8A93AB | secondary text |
| `--text-subtle` | #9AA1B2 | #5D6680 | placeholders, done-task text, open status ring |
| `--line` | #E4E7EE | #222B44 | hairlines, Day Line track |
| `--accent` | #2E5BFF | #7B95FF | done, primary actions, today |
| `--danger` | #E5484D | #FF7A7D | missed, destructive |
| `--on-accent` | #FFFFFF | #0B1020 | text/icons on accent |

Theme: follow the system by default; Settings → Appearance can force light or dark
(`:root[data-theme="light|dark"]`).

Spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Page inset 20. Row min height 56.
Touch target 44. Control height 40. Radius: 6 (small), 12 (fields), 16 (option lists,
suggested rows), 24 (sheets, cards), full (buttons, Add Bar, tags, segmented control).
Shadow "float": `0 1px 2px rgba(19,32,74,.04), 0 12px 32px rgba(19,32,74,.08)` —
only on floating things (Add Bar, toasts, selected segment), never on every card.

### Type — Instrument Sans only (Google Fonts: 400, 500, 600)
| Style | Size / line | Weight | Tracking |
| --- | --- | --- | --- |
| Display/Day Large (iPad/desktop date) | 48/52 | 600 | -2.5% |
| Display/Day (phone date) | 34/40 | 600 | -2% |
| Title | 22/28 | 600 | -1% |
| Heading | 17/24 | 600 | -0.5% |
| Body/Task | 17/24 | 400 | -0.5% |
| Body | 15/22 | 400 | 0 |
| Body/Note | 16/26 | 400 | 0 |
| Body/Small | 13/18 | 400 | 0 |
| Label | 15/20 | 500 | 0 |
| Label/Small (section headers) | 13/16 | 500 | 0 |
| Caption / Caption/Strong / Caption/Tag | 12/16 | 400 / 500 / 500 | 0 |
| Numeric/Day | 15/20 | 500, tabular figures | 0 |
Sentence case everywhere. No all-caps labels.

### Components (Figma "Components" page)
Status (Open, Done, Missed, Carried, Suggested) · Task Row · Tag · Button (Primary,
Secondary, Quiet, Danger) · Icon Button · Add Bar (Idle, Typing) · Week Day · Day Line ·
Segmented Control · Month Cell (Large, Compact) · Sync Status · Toast · Text Field.
Icons: 24px grid, 1.75 stroke, round caps/joins (Lucide-style; inline SVG is fine).

### App icon — final (A3, Day Line; approved 14 Oct 2026)
Figma: App Icon page, component "Icon A3 · Day Line, all white". Navy `#13204A`
background, white Done mark (circle) with a blue `#2E5BFF` tick, and a Day Line
underneath: three white segments and one blue. Colours: navy #13204A, white, blue #2E5BFF.
All PNGs are full-bleed squares, no transparency or rounded corners (the OS applies its
own mask). Maskable versions scale the artwork to 84% to sit inside the safe zone.
Files: `public/icons/` (`icon.svg` master, `icon-192/512`, `icon-maskable-192/512`,
`apple-touch-icon` 180, `favicon-16/32`), `public/favicon.ico` (16/32/48), and
`resources/icon-1024.png` (master raster for a future Capacitor wrap; not shipped).
Don't redraw or recolour it in code; changes start in Figma.

### Key interactions
- **Status circle:** tap toggles open ↔ done. Press and hold a task → Task actions sheet
  (D2): mark done, missed (→ reason sheet D3), move to another day (→ D4), open note,
  delete (with Undo toast).
- **Day Line:** one segment per task in list order; done = accent, missed = danger,
  carried = accent-soft with accent outline, open = line. Summary text below it
  ("3 of 7 done").
- **Carried from yesterday:** at the top of today when the previous day has carried
  tasks, shown as Suggested rows with an "Add both / Add all" action. Provisional:
  dismissing one leaves it marked missed on yesterday (confirm with Amin).
- **Add Bar:** floats above the home indicator and keyboard; on a past or future day
  it reads "Add to Monday" etc.
- **Close the day (D5):** each open task gets Tomorrow / Another day / Missed, then
  one "Close the day" button. The prompt moves to the top of the day after 8pm
  (provisional time — confirm with Amin).
- **Notes:** one sheet with Day / Task / Week tabs (bottom sheet on phone, side panel
  on iPad and desktop). Month shows tasks only, never notes.

### Screen list (IDs used across Figma flows and wireframes)
E2 Welcome · E3 Install guide · D1 Day (empty, in progress, all done, past, future) ·
D2 Task actions · D3 Missed reason · D4 Move to another day · D5 End of day ·
M1 Month · N1 Notes sheet · A1 Enter email · A2 Check your email · A3 Link expired ·
A4 Bring your tasks · A5 Add a passkey · S1 Settings · S2 Account · S3 Appearance ·
S4 Your data · S5 Delete account · S6 Goodbye · S7 About · X1 Sync details ·
X2 Conflict notice · X3 Toasts · X4 Offline state · X5 Not found · L1 Privacy · L2 Terms.
No splash screen (dropped 14 Oct 2026); the launch screen is just `--bg`.

### Layouts by device
- **Phone (390 wide):** single column. Header icons (Month, Notes, Settings), Day Line,
  week strip, lists, floating Add Bar at the bottom. Notes is a bottom sheet (half height,
  drag to full). Task actions, missed reason and move are bottom sheets.
- **iPad landscape (1180 wide):** Day on the left, Notes as a persistent panel on the
  right (~432px); the note icon toggles it and shows an active state. Month: large grid
  (up to three tasks per cell) with the selected day in a right panel (~360px).
  Sheets become popovers anchored to the task. iPad portrait falls back to phone layout.
- **Mac / desktop (1440 wide):** left sidebar (264px: MyDay mark, Today / Month /
  Week note, mini month, sync status, Settings) replaces the header icons and week
  strip; Day in the centre with the Add Bar at the **top** of the list; Notes panel on
  the right (~420px) showing the selected task's note. Month: sidebar + full grid +
  selected-day panel. Keyboard: N add task, Space complete selected, ← → change day,
  T today.
- Breakpoints (suggested): phone < 768, tablet 768–1279, desktop ≥ 1280.

**Design status (14 Oct 2026):** final in Figma — tokens, components, flows, all Day
screens (D1–D5), Month (M1), Notes (N1: day, task, week tabs), and the iPad and Mac
layouts for Day and Month. Not separately designed — sign-in, Settings and system
screens: build them from the components and the screen list above, then show Amin
before polishing.

## Data model (matches the legacy artifact — keep these shapes)
Day document, keyed by ISO date `YYYY-MM-DD`:
```json
{ "date": "2026-10-13", "dayNote": "<html>", "updatedAt": "ISO",
  "tasks": [{ "id": "wialh1mq", "text": "", "status": "open|done|missed|cf",
              "reason": "", "note": "<html>", "from": null, "carried": null }] }
```
Week note, keyed by week-start date (Monday): `{ "note": "<html>" }`.
Notes are contentEditable HTML (bold, h3, lists, checklists `ul.chk li[data-done]`, links).
Keep the stored status value `cf`; the UI calls it "Carried".

D1 tables (`migrations/0001_init.sql`):
- `days(user_id, date, body JSON, updated_at, version, PRIMARY KEY(user_id, date))`
- `weeks(user_id, week_start, note TEXT, updated_at, version, PRIMARY KEY(user_id, week_start))`
- `sync_seq(user_id, seq)`: per-user change counter. Every stored write takes the next
  number as its `version`; that number is the sync cursor.

## Sync design
- Every edit writes to IndexedDB immediately and marks the doc dirty (keep the existing
  ~500 ms debounce in `changed()` / `flush()`).
- A sync loop pushes dirty docs (`PUT /api/days/:date`, `PUT /api/weeks/:start`) and
  pulls changes (`GET /api/changes?since=<cursor>`). Run on load, on focus/visibilitychange,
  on reconnect, and every ~30 s while visible.
- API (built in step 4, `worker/api.js`): `PUT /api/days/:date`, `PUT /api/weeks/:start`
  (a Monday; body `{note, updatedAt}`) → `{ok, version}`; `GET /api/changes?since=N&limit=`
  → `{days, weeks, cursor, more}`, oldest first; `GET /api/health`. Until sign-in (step 6)
  every data route answers 401 when deployed; locally `DEV_USER_ID` in `.dev.vars` signs
  localhost requests in.
- Conflict rule: whole-document last-write-wins by `updatedAt`, server timestamp as
  tiebreak. The server enforces it: a PUT older than the stored doc gets **409** with the
  server's copy (`{error:"conflict", server}`); on a tie the later arrival wins. Never drop a newer local edit silently — if the server is newer while local
  is dirty, keep both (stash the losing version) and surface the Conflict notice (X2).
- Sync Status component replaces "Synced to your Claude account": "Synced just now",
  "Syncing", "Offline. Changes are saved on this device.", "Couldn't sync. Tap to try again."
- The legacy code abstracts storage in `getDay / putDay / queryDays` and the week-note
  functions (`ensureWeekNote`, `flushWeek`) — swap those for the new IndexedDB + sync
  layer. Remove the `window.claude` boot path and the `onSnapshot` listeners (replace
  with the pull loop).
- Keep the midnight roll-over and per-device UI prefs in localStorage (`dp:view`,
  `dp:pane`, `dp:scope`) — those don't sync.

## Import
One-off: `migration/myday-export-2026-10-14.json` has `{ days: {date: dayDoc},
weeks: {weekStart: {note}} }` (5 days, 2 weeks). Provide either a script
(`wrangler d1 execute`) or Settings → Your data → Import. Also add **Export** there.

## Store-ready baseline (applies to every Kasah Kod app)
- **Account:** sign in, sign out (this device / everywhere), change email,
  **delete account** (removes all server data, typed DELETE confirmation).
- **Your data:** export, import. Signed-out use works locally; on first sign-in,
  offer to move local tasks into the account (A4).
- **Settings:** account, appearance (system/light/dark), your data, about (version +
  build number, what's new, support email, privacy, terms), sync status.
- **Legal pages:** `/privacy` and `/terms` — plain, short, honest: what's stored,
  where, no tracking, how to delete.
- **Offline & updates:** app shell cached; every screen usable offline; service worker
  shows the "A new version of MyDay is ready — Refresh" toast instead of silently
  swapping code.
- **Native feel:** standalone display, safe areas, no zoom-on-input (16px+ inputs),
  no text selection on chrome, 44px touch targets, full icon set (maskable +
  apple-touch-icon), plain `--bg` launch screen.
- **Security:** API validates every input (zod), rate-limits auth endpoints, CSP and
  security headers via `_headers`, secrets only in `wrangler secret`, never in repo.
- **Privacy-friendly analytics only:** Cloudflare Web Analytics (cookieless) or none.
- **Accessibility:** keyboard reachable, visible focus, labels on icon buttons,
  respects reduced motion, contrast checked in both themes.
- **Reliability:** separate `preview` and `production` environments (own Worker and D1
  each, see Hosting); D1 Time Travel is the backup/restore path (see README); schema changes only via migrations.
- **Quality:** Vitest for the sync/merge logic, Playwright smoke test (sign in → add
  task → reload offline → still there); GitHub Actions runs them on every PR.
- **Versioning:** semver in package.json, shown in Settings; CHANGELOG.md.

## Build order
1. ✅ **Repo setup** — Vite project, legacy file split into index.html /
   src/styles.css / src/app.js, README, .gitignore, CHANGELOG, package.json 0.1.0.
2. ✅ **Local-first:** replace storage with IndexedDB behind getDay/putDay/queryDays.
   App fully works signed-out. Keep the current look for now so Amin can keep using it.
3. ✅ **PWA:** manifest, icon set, service worker with update prompt. Test Add to Home
   Screen on iPhone and iPad, and install on Mac. (Icon: final, see
   Design → App icon. Manifest and theme colours use the current background; switch to
   `--bg` in step 5.)
4. **Backend:** Worker API + D1 schema + migrations; wrangler config with preview and
   production environments.
5. **Redesign — Clear day:** replace `:root` tokens and styles, swap fonts to
   Instrument Sans, rebuild Day (D1–D5), Month (M1) and Notes (N1) to match Figma,
   including the iPad and Mac layouts. Behaviour stays the same.
6. **Sign-in:** Better Auth (magic link via Resend), session cookie, sign-in screens
   A1–A5 in the Clear day style, sign out, then passkeys.
7. **Sync:** push/pull loop, conflict rule, Sync Status; test two devices editing
   offline then reconnecting.
8. **Account & data:** Settings (S1–S7), export/import, move-local-tasks-on-first-
   sign-in, delete account, privacy + terms pages.
9. **Hardening:** validation, rate limits, security headers, accessibility pass,
   tests + GitHub Actions.
10. **Launch:** deploy to myday.kasahkod.cc, sign in, import a fresh export from the
    artifact (ask Amin for it on cutover day), use it for a week, then retire the artifact.

## How we work
- MyDay is used every day — treat it as a real product, not a prototype.
- One build step at a time. Each step gets its own branch (`step-2-local-first`, …)
  with small, clear commits, and a PR into `main` when done. Amin reviews and merges.
- At the end of each step, stop and report: what changed, how to test it on his
  devices, what's next.
- Decisions that are Amin's (naming, paid services, trade-offs, anything marked
  provisional above): ask, don't guess.
- Keep this file current: if a decision changes, update it in the same PR.
- `README.md` is for people (what it is, how to run it). This file is for Claude Code.
  Keep them separate; don't duplicate run instructions here.

## Data safety
- The GitHub repo (`PejabatDigital/myday`) is **public**. `migration/` holds real tasks
  and notes and is git-ignored — never commit exports, D1 dumps or `.dev.vars`.
- Secrets live only in `wrangler secret` / git-ignored `.dev.vars`.

## Conventions
- Amin works in VS Code with Claude Code, commits to GitHub, deploys via Cloudflare.
- No-frills: no reminders or notifications. New features only when Amin asks.
- Design changes start in Figma, then come here — don't invent new visual styles in code.
