# Blutheist

A free desktop music player: the YouTube Music catalog and your own music folders in one library, word-synced lyrics,
playlists, a spinning-record Now Playing panel with a live spectrum, and an eye-themed interface.

Blutheist is built with Electron, React, TypeScript and Vite.

## Build it

```
npm ci
npm run build
npx electron-builder --win nsis --publish never
```

Or let GitHub build it: push to `main` (or run the **Build Windows** workflow from the Actions tab) and download the
`Blutheist-Windows` artifact. See `GITHUB_GUIDE.md`.

## Licence

GPL-3.0 (see `LICENSE`); third-party attributions are in `NOTICE`. The GPL covers the code, not the Blutheist name or logo.
