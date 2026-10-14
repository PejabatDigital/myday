# Changelog

All notable changes to MyDay are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-14

### Added
- Vite project setup: `npm run dev`, `npm run build`, `npm run preview`.
- README, CHANGELOG and `.editorconfig`.

### Changed
- The single-file Claude artifact is split into `index.html`, `src/styles.css`
  and `src/app.js`. Look and behaviour are unchanged; data is still stored in
  the browser's localStorage.
