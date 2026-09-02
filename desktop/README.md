# Docket for Mac

A thin Tauri shell around the live site (https://docket-wine-one.vercel.app).
The web app is still the product; the shell adds what a browser cannot do:

- Dropping a folder or file from Finder hands the page its real path.
  The shell maps a path on a mounted share (`/Volumes/CLIENTS/...`) back
  to the `smb://` URL the office uses, by reading the mount table.
- `smb://`, `afp://`, and `file://` links open in Finder.

The web side detects the shell through `window.__TAURI__`
(`app/composables/useDesktop.ts`, `app/plugins/desktop.client.ts`).
Drops arrive as a `desktop-drop` DOM event on the element under the
cursor, with the paths in `event.detail.paths`.

## Building

Needs Rust (`curl https://sh.rustup.rs | sh`) and the Xcode command line
tools. Then:

```bash
cd desktop
npm install
npm run build
```

The app lands in `src-tauri/target/release/bundle/macos/Docket.app` and a
DMG next to it. `npm run dev` opens the shell against `http://localhost:3000`
instead, for working on the web app inside it.

## Signing

An unsigned build runs on the machine that built it. To hand it to the
team it needs an Apple Developer account: set `APPLE_SIGNING_IDENTITY`
(and the notarization variables `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`) in the environment before `npm run build` and Tauri
signs and notarizes the bundle. Until then, people can right-click the
app and choose Open once to get past Gatekeeper.

## Updating

The site updates itself; the shell only needs a new build when the shell
changes. Auto-update of the shell is not set up yet.
