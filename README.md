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

## Where things live

| Path | What |
| --- | --- |
| `index.html` | App markup |
| `src/styles.css` | All styles; design tokens live in `:root` |
| `src/app.js` | App logic and rendering |
| `src/store/` | On-device storage (IndexedDB) |
| `public/` | Static files copied as-is into the build (icons, manifest) |
| `legacy/myday-artifact.html` | The original single-file Claude artifact, kept for reference |
| `CLAUDE.md` | Project brief for Claude Code: stack, design, data model, sync, build order |

## Design

The app is moving to a new look, **Clear day**. The Figma file is the source of truth:
[MyDay — App Design](https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT).

## Status

Data is stored on each device in IndexedDB and works fully offline, with no account.
Anything saved by the earlier localStorage version is moved over automatically on first launch.
Cross-device sync and the new design arrive in later build steps (see `CLAUDE.md`).
