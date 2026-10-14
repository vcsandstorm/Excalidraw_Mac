# Excalidraw for Mac

A local, offline macOS app for [Excalidraw](https://github.com/excalidraw/excalidraw)
(MIT), built with Tauri 2 around the `@excalidraw/excalidraw` package.

## Build & install

```bash
npm install
npx tauri build
cp -R src-tauri/target/release/bundle/macos/Excalidraw.app /Applications/
```

`npm run dev` runs the UI in a browser with native calls stubbed (`src/devMocks.js`);
`npx tauri dev` runs it in the real app window with hot reload.

## Where things live

- `src/App.jsx` – canvas, file open/save/export, autosave, shortcuts
- `src-tauri/src/main.rs` – file I/O commands and Finder "open file" handling
- Session autosave + library: `~/Library/Application Support/local.excalidraw.mac/`
- Fonts are bundled from the npm package into `public/fonts` on install (no CDN).

To update Excalidraw: `npm install @excalidraw/excalidraw@latest`, then rebuild.
