# Desktop native attention — canonical frontend signals

Echo’s **Tauri shell** should react to OS-facing cues (notifications, taskbar attention, tray state) using the **same attention model** the SPA already maintains. Do **not** re-implement unread/mention/call rules in Rust.

## Primary source: `useEchoAttentionStore`

Store: [`frontend/src/stores/echoAttention.ts`](../../frontend/src/stores/echoAttention.ts).

| Surface                     | Role                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replaceSnapshot`           | Full replace of channel attention + read cursors (hydration / big refresh).                                                                                               |
| `patchReadState`            | Local read cursor movement for one channel.                                                                                                                               |
| `mergeReadStateUpdate`      | Incremental merge from realtime / history orchestration.                                                                                                                  |
| `serverAttentionByServerId` | Derived **per-server** unread + strongest `pingKind` among server channels (canonical “guild needs attention”).                                                           |
| `dmAttentionByChannelId`    | Derived **DM / group DM** threads with unread counts + activity ids.                                                                                                      |
| `desktopAttentionScore`     | **Single scalar** for desktop shell: rises when server unread severity or DM unread volume increases (used by `useDesktopNativeAttention` without duplicating ping math). |

Hydration paths that feed the store include workspace / history orchestration and the realtime host; the desktop layer should **only subscribe** to the store (or the score), not to raw sockets.

## Layout / navigation (secondary)

- [`useAppLayoutController`](../../frontend/src/features/layout/composables/useAppLayoutController.ts) — rail, modals, voice; exposes `openUserSettingsModal`, `openDmInboxFromRailOverflow`, `activeRailTab`, etc. Tray / deep-link handlers should call these rather than re-deriving routes.
- [`useAppLayoutDmRailUnread`](../../frontend/src/services/orchestration/useAppLayoutDmRailUnread.ts) — DM rail clustering (includes **in-call** pinning).
- **Incoming call (desktop shell):** [`useDesktopIncomingCallAttention`](../../frontend/src/composables/useDesktopIncomingCallAttention.ts) watches `dmCallRingUi` from the layout stack. When the document is hidden and desktop alerts are on, it sends one OS notification + **critical** user attention per ring session (no duplicate call model in Rust).

## Personal prefs gate

Desktop notifications must respect [`useNotificationPreferencesStore`](../../frontend/src/stores/notificationPreferences.ts) **`desktopAlerts`**. The shell invokes OS notification APIs only when this flag is on (see `useDesktopNativeAttention`).

## Summary

1. **Unread / mentions / DM activity** → `echoAttention` (+ `desktopAttentionScore`).
2. **Open Messages / settings** → existing layout helpers + Tauri **events** from tray (`echo-desktop-tray`), handled in [`AppLayout.vue`](../../frontend/src/components/AppLayout.vue).
3. **Calls** → extend later from the same LiveKit / toast signals; not duplicated in Rust.

**Shell-only preferences** (close-to-tray, launch at login, manual update check) live under **Settings → Desktop** ([`SettingsDesktop.vue`](../../frontend/src/features/settings/components/SettingsDesktop.vue)) and call through [`desktopBridge.ts`](../../frontend/src/platform/desktopBridge.ts); they do not change attention rules.
