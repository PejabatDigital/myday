# MyDay — project brief for Claude Code

MyDay is Amin's daily to-do app, used every day: a task list beside notes, an end-of-day
carry-forward, and a minimal month view. A **task app with a calendar**, not a calendar
with events. Part of the Kasah Kod studio.

It first ran as a Claude artifact (`legacy/myday-artifact.html`), where Claude stored
the tasks online and knew who the user was. This project replaces those two things with
our own, so MyDay works for Amin and for anyone else who signs in.

## What we're building — and only this
1. **Online storage** for everyone's tasks (Cloudflare Worker + D1). *(built — see step 4)*
2. **Email and password sign-in**, so each person sees only their own tasks.
3. **Sync**, so the same tasks appear on phone, iPad and Mac.
4. **The new look** (Clear day, from Figma).

Then we're done. Already working: device storage, offline use, Add to Home Screen, final icon.

**Not doing** (don't build, don't suggest unless Amin asks): automated tests, preview /
staging environments, branches or pull requests, importing Amin's old tasks, passkeys,
account deletion, export/import, extra Settings screens, App Store work, analytics,
conflict screens.

## Stack (as it stands)
- Frontend: vanilla HTML/CSS/JS with Vite — `index.html`, `src/`. No UI framework.
- Device storage: IndexedDB (`src/store/`), works offline. Service worker + manifest done.
- Backend: one Cloudflare Worker serving the built app and the API (`worker/`, `/api/*`),
  database D1 `myday-production`. Config `wrangler.jsonc`. Live at `myday.kasahkod.cc`.
- Every row in the database belongs to a `user_id`; the API only touches the signed-in
  user's rows.
- Email for kasahkod.cc (set up by Amin; don't touch its DNS records in Cloudflare):
  iCloud hosts the mailboxes hello@ and no-reply@; Resend (domain kasahkod.cc, Tokyo
  region, open/click tracking off) sends the app's account emails from no-reply@; DMARC
  reports go to no-reply@. Resend because Cloudflare is on the free plan.
- Cloudflare Workers free plan: 10 ms CPU per request. Passwords use PBKDF2-SHA256 via Web
  Crypto at 5,000 rounds (Amin's choice over upgrading), not Better Auth's scrypt (~65 ms).

## How we work
- Work directly on `main`. No branches, no pull requests. Pushing to `main` updates the
  live app at myday.kasahkod.cc, so only push when a step works.
- One step at a time. After each step, tell Amin in plain, non-technical words: what
  changed, what he should see, and the one thing (if any) he needs to do.
- Don't reopen decisions already made, and don't add extras. If something genuinely
  blocks progress, explain it simply and ask.
- Keep this file current when a decision changes.
- Secrets only in `wrangler secret` / git-ignored `.dev.vars`. The repo is public:
  never commit `migration/`, exports or `.dev.vars`.

## Steps
1. ✅ Repo setup.
2. ✅ Device storage and offline.
3. ✅ Installable app and final icon.
4. ✅ Online storage (Worker API + D1 `myday-production`), live at myday.kasahkod.cc.
5. ✅ **Email and password sign-in.** Better Auth's email and password, on its own page
   `/signin` (sign in, create account, forgot password, choose a new password). Anyone can
   sign up; new accounts must confirm their email (link by email) before they can sign in.
   "Forgot password" emails a reset link. Emails go through Resend from
   no-reply@kasahkod.cc (secret `RESEND_API_KEY`). Stay signed in for a long time
   (~60 days, renewing) so the installed app rarely asks again. A simple way to sign out.
   The app still works signed-out on one device.
   - Plain privacy page at `/privacy`: what's stored (email, scrambled password, tasks),
     where, Resend only for account emails, no tracking. Contact hello@kasahkod.cc.
6. **Sync.** Connect device storage to online storage for signed-in users: send changes
   up, pull changes down, on open, on return to the app, on reconnect, and every ~30 s
   while open. Rule: the latest edit wins. Show the simple footer status (Synced /
   Syncing / Offline / Couldn't sync). When someone signs in for the first time, upload
   whatever is already on that device.
7. **The new look.** Apply the Clear day design below to Day, Month and Notes, on phone,
   iPad and Mac. Behaviour stays exactly as it is today. Switch the manifest/theme colour
   to `--bg`. Build the sign-in button and sign-out in the same style.

Done after step 7.

## Design — Clear day
**Source of truth:** Figma "MyDay — App Design"
https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT — pages Components, Wireframes —
Phone / iPad / Desktop, Hi-fi. If the Figma MCP server is connected, read from it;
otherwise use the values below.

**Direction:** modern and minimal. Navy and blue on a cool off-white; one typeface;
round status marks; 56px rows with no dividers; floating Add Bar at the bottom; the
**Day Line** under the date. No paper texture, ruled lines, red margin, serif or mono.

### Tokens (CSS custom properties on `:root`)
| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #F6F7F9 | #0B1020 | app background |
| `--surface` | #FFFFFF | #131A2E | cards, sheets, Add Bar, icon buttons |
| `--subtle` | #EEF1F6 | #1A2238 | secondary buttons, fields, chips |
| `--accent-soft` | #E8EEFF | #1A2550 | carried / suggested backgrounds |
| `--danger-soft` | #FDECEC | #3A1A20 | missed tag |
| `--text` | #13204A | #E9ECF5 | primary text; toast background |
| `--text-muted` | #6B7389 | #8A93AB | secondary text |
| `--text-subtle` | #9AA1B2 | #5D6680 | placeholders, done-task text, open ring |
| `--line` | #E4E7EE | #222B44 | hairlines, Day Line track |
| `--accent` | #2E5BFF | #7B95FF | done, primary actions, today |
| `--danger` | #E5484D | #FF7A7D | missed, destructive |
| `--on-accent` | #FFFFFF | #0B1020 | text/icons on accent |
Theme follows the device's light/dark setting.

Spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Page inset 20. Row min height 56. Touch
target 44. Control height 40. Radius 6 / 12 (fields) / 16 (lists) / 24 (sheets) / full
(buttons, Add Bar, tags). Shadow only on floating things (Add Bar, toasts):
`0 1px 2px rgba(19,32,74,.04), 0 12px 32px rgba(19,32,74,.08)`.

### Type — Instrument Sans only (400, 500, 600)
Date 34/40 600 (48/52 on iPad/Mac) · Title 22/28 600 · Heading 17/24 600 ·
Task 17/24 400 · Body 15/22 400 · Note 16/26 400 · Small 13/18 400 · Label 15/20 500 ·
Section header 13/16 500 · Caption 12/16. Sentence case everywhere.

### Components (Figma "Components" page)
Status circle (open, done, missed, carried, suggested) · Task Row · Tag · Button ·
Icon Button · Add Bar · Week Day · Day Line · Segmented Control · Month Cell · Sync
Status · Toast · Text Field. Icons: 24px, 1.75 stroke, round ends.

### App icon — final (A3, Day Line)
Navy #13204A, white circle with blue #2E5BFF tick, three white segments and one blue.
Files in `public/icons/`. Don't redraw it in code.

### Key interactions (same behaviour as today, new look)
- Tap the status circle: open ↔ done. Press and hold a task: actions sheet — done,
  missed (with optional reason), move to another day, open note, delete (with Undo).
- Day Line: one segment per task; done = accent, missed = danger, carried =
  accent-soft with accent outline, open = line. Summary under it ("3 of 7 done").
- Yesterday's carried tasks show at the top of today with an "Add all" action.
- Add Bar floats at the bottom (on Mac it sits at the top of the list); on another day
  it reads "Add to Friday".
- End of day: each open task goes to Tomorrow, Another day or Missed, then "Close the day".
- Notes: Day / Task / Week tabs — bottom sheet on phone, side panel on iPad and Mac.
  Month shows tasks only.

### Layouts
- **Phone:** one column; header icons (Month, Notes, Settings), Day Line, week strip,
  list, floating Add Bar. Sheets slide up from the bottom.
- **iPad landscape:** Day on the left, Notes panel on the right (~432px). Month: big grid
  plus the selected day in a right panel. iPad portrait uses the phone layout.
- **Mac:** left sidebar (Today / Month / Week note, mini month, sync status, sign-out)
  replaces the header icons and week strip; Day in the centre; Notes panel on the right.
- Breakpoints: phone < 768, tablet 768–1279, desktop ≥ 1280.

## Data (keep these shapes — they match the original app)
Day, keyed by `YYYY-MM-DD`:
`{ date, dayNote (html), updatedAt, tasks: [{ id, text, status: open|done|missed|cf,
reason, note (html), from, carried }] }`
Week note, keyed by Monday's date: `{ note (html) }`. Stored status `cf` = "Carried" in the UI.
Database tables: `days`, `weeks`, `sync_seq` (`migrations/0001_init.sql`).
API: `PUT /api/days/:date`, `PUT /api/weeks/:start`, `GET /api/changes?since=N`,
`GET /api/health`.

## Conventions
- No-frills: no reminders or notifications. New features only when Amin asks.
- Design changes start in Figma, then come here.
- `README.md` is for people (what it is, how to run it); keep it short and current.
