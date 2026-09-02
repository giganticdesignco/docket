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
changes. When it does:

```bash
cd desktop
./release.sh 0.2.0 "What changed, in a sentence"
```

That bumps the version everywhere, builds, copies the DMG to your
Desktop, and rewrites `public/desktop/latest.json`. Upload the DMG to the
public `desktop` bucket in Supabase Storage under exactly the name the
script prints, then commit and push. Every open Mac app compares its own
version with `latest.json` on launch and once a day and shows a banner
with a Download button when the site has a newer one. "Not now" hides
that version until the next one.

In-place auto-update (`tauri-plugin-updater`) waits for the Apple
Developer account: a replaced, unsigned app may not get past Gatekeeper.
