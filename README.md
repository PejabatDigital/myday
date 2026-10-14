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
```

## Where things live

| Path | What |
| --- | --- |
| `index.html` | App markup |
| `src/styles.css` | All styles; design tokens live in `:root` |
| `src/app.js` | All app logic |
| `public/` | Static files copied as-is into the build (icons, manifest) |
| `legacy/myday-artifact.html` | The original single-file Claude artifact, kept for reference |
| `CLAUDE.md` | Project brief for Claude Code: stack, design, data model, sync, build order |

## Design

The app is moving to a new look, **Clear day**. The Figma file is the source of truth:
[MyDay — App Design](https://www.figma.com/design/7HHfGaTye4sIoSabAMCsxT).

## Status

Data is currently stored in the browser's localStorage, one copy per browser.
IndexedDB, cross-device sync and the new design arrive in later build steps (see `CLAUDE.md`).
