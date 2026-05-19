# macOS desktop (Tauri)

## Artifacts (local build)

Typical outputs:

- `src-tauri/target/release/bundle/dmg/` — `.dmg`
- `src-tauri/target/release/bundle/macos/` — `.app` (as produced by the bundler)

Universal binary (Apple Silicon + Intel): add `--target universal-apple-darwin` to the Tauri build (see platform doc).

## Build (repo root)

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

## Details

Developer ID, notarization, and release checklist: [`docs/operations/desktop-macos.md`](../docs/operations/desktop-macos.md). Updater roadmap: [`docs/operations/tauri-phase2.md`](../docs/operations/tauri-phase2.md).
