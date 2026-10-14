# Changelog

All notable changes to MyDay are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-10-14

### Added
- API on a Cloudflare Worker (`worker/`): store a day (`PUT /api/days/:date`), store a
  week note (`PUT /api/weeks/:weekStart`), list changes since a cursor
  (`GET /api/changes`), and a health check. Every input is validated (zod), every
  row is keyed by user, and an edit older than the stored one is refused with 409.
  Data requests need sign-in, which arrives in a later step; the app doesn't call the
  API yet.
- D1 schema and migrations; separate preview (`myday-preview`) and production
  (`myday-production`) databases.
- `wrangler.jsonc`: the built app is served as Worker static assets; `/api/*` runs
  the Worker.
- Local API development (`npm run dev:api`, `npm run db:migrate:local`) and API tests.

## [0.3.0] - 2026-10-14

### Added
- Installable app (PWA): web app manifest, iOS home-screen tags, and the final app
  icon (A3, Day Line): manifest, maskable, Apple touch and favicon sizes.
- Service worker: the app and its fonts are cached, so MyDay opens and works offline.
- "A new version of MyDay is ready" toast. The new version only takes over when you
  tap Refresh, after any unsaved edits are written.

### Changed
- Safe-area padding now also covers the left and right edges (iPhone in landscape).

## [0.2.0] - 2026-10-14

### Changed
- Tasks, day notes and week notes are now stored on the device in IndexedDB
  instead of localStorage. Look and behaviour are unchanged.
- Anything saved by the localStorage version is moved over on first launch;
  the old copies are kept as a backup.
- Saves are queued so they land in order, and each one is held in localStorage
  until IndexedDB confirms it, so an edit made just before the app is closed or
  suspended is restored on the next launch.
- The browser is asked to keep MyDay's storage persistent.
- Every saved change is marked for the upcoming sync step.

### Removed
- The Claude artifact storage and live-update listeners (`window.claude`).

### Added
- Vitest unit tests for the storage layer (`npm test`).

## [0.1.0] - 2026-10-14

### Added
- Vite project setup: `npm run dev`, `npm run build`, `npm run preview`.
- README, CHANGELOG and `.editorconfig`.

### Changed
- The single-file Claude artifact is split into `index.html`, `src/styles.css`
  and `src/app.js`. Look and behaviour are unchanged; data is still stored in
  the browser's localStorage.
