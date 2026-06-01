# Releases (native apps)

Short entry points for **where build outputs land** and **which command to run**. Deep procedures (CORS, signing, Play Store, troubleshooting) stay in [`docs/operations/`](../docs/operations/).

| File                                     | Topic                                                 |
| ---------------------------------------- | ----------------------------------------------------- |
| [desktop-windows.md](desktop-windows.md) | Tauri Windows — NSIS/MSI, CI, GitHub Release workflow |
| [desktop-macos.md](desktop-macos.md)     | Tauri macOS — DMG / `.app` bundle paths               |
| [desktop-linux.md](desktop-linux.md)     | Tauri Linux — `.deb`, AppImage                        |
| [android.md](android.md)                 | Tauri Android — AAB/APK outputs, CI artifacts         |
| [ios.md](ios.md)                         | Tauri iOS — IPA / simulator builds, CI artifacts      |

**Version alignment:** keep `version` in sync across root `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (plus Android-specific fields in `src-tauri/tauri.android.conf.json` and iOS fields in `src-tauri/tauri.ios.conf.json` when shipping mobile). See platform docs for details.

**Roadmap / updater:** [`docs/operations/tauri-phase2.md`](../docs/operations/tauri-phase2.md).
