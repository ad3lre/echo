<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { icons } from '@/assets/icons';
import {
  isDesktop,
  bringMainWindowToForeground,
  getDesktopCloseToTray,
  setDesktopCloseToTray,
  getDesktopLaunchAtLogin,
  setDesktopLaunchAtLogin,
  checkDesktopAppUpdate,
  downloadAndRelaunchDesktopUpdate,
} from '@/platform/desktopBridge';
import { applyDesktopBringFrontShortcut } from '@/platform/desktopGlobalShortcutBringFront';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const closeToTray = ref(true);
const launchAtLogin = ref(false);
const globalBringFront = ref(true);
const updateBusy = ref(false);
const updateHint = ref('');

onMounted(async () => {
  if (!isDesktop()) return;
  try {
    closeToTray.value = await getDesktopCloseToTray();
  } catch {
    /* ignore */
  }
  try {
    launchAtLogin.value = await getDesktopLaunchAtLogin();
  } catch {
    /* ignore */
  }
  try {
    globalBringFront.value =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('echo.desktop.shortcut.bringFront') !== '0';
  } catch {
    globalBringFront.value = true;
  }
});

async function onCloseToTrayToggle() {
  if (!isDesktop()) return;
  const next = !closeToTray.value;
  closeToTray.value = next;
  try {
    await setDesktopCloseToTray(next);
    try {
      localStorage.setItem('echo.desktop.closeToTray', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  } catch (e) {
    closeToTray.value = !next;
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not update close behavior.',
      'warning',
    );
  }
}

async function onLaunchAtLoginToggle() {
  if (!isDesktop()) return;
  const next = !launchAtLogin.value;
  launchAtLogin.value = next;
  try {
    await setDesktopLaunchAtLogin(next);
  } catch (e) {
    launchAtLogin.value = !next;
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not change launch at login.',
      'warning',
    );
  }
}

async function onGlobalBringFrontToggle() {
  if (!isDesktop()) return;
  const next = !globalBringFront.value;
  globalBringFront.value = next;
  try {
    localStorage.setItem('echo.desktop.shortcut.bringFront', next ? '1' : '0');
    await applyDesktopBringFrontShortcut();
  } catch (e) {
    globalBringFront.value = !next;
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not update global shortcut.',
      'warning',
    );
  }
}

async function onCheckForUpdates() {
  if (!isDesktop()) return;
  updateBusy.value = true;
  updateHint.value = '';
  try {
    const res = await checkDesktopAppUpdate();
    if (res.status === 'none') {
      updateHint.value =
        'You’re on the latest version (or the update server is not configured).';
      dispatchAppToast(updateHint.value, 'info');
    } else if (res.status === 'available') {
      updateHint.value = `Update available: ${res.version}.`;
      dispatchAppToast(`${updateHint.value} Installing…`, 'info');
      await downloadAndRelaunchDesktopUpdate();
    } else {
      updateHint.value = res.message;
      dispatchAppToast(res.message, 'warning');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateHint.value = msg;
    dispatchAppToast(msg, 'warning');
  } finally {
    updateBusy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="-mt-1 max-w-2xl text-sm leading-relaxed text-fg-soft">
      Native Echo shell options: tray, close-to-tray, global shortcuts, startup,
      and updates. Linux tray hosts may vary; see desktop operations docs if the
      icon does not appear.
    </p>

    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label">Window & startup</div>
      <div class="mt-4 flex flex-col gap-3">
        <button
          type="button"
          class="settings-toggle"
          @click="onCloseToTrayToggle"
        >
          <span class="flex min-w-0 flex-1 items-start gap-3">
            <img
              :src="icons.desktop"
              alt=""
              class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-foreground"
                >Close to system tray</span
              >
              <span class="block text-left text-sm text-muted"
                >When off, closing the window exits Echo. When on, Echo stays
                running in the tray.</span
              >
            </span>
          </span>
          <span
            :class="closeToTray ? 'toggle-pill toggle-pill--on' : 'toggle-pill'"
          />
        </button>

        <button
          type="button"
          class="settings-toggle"
          @click="onLaunchAtLoginToggle"
        >
          <span class="flex min-w-0 flex-1 items-start gap-3">
            <img
              :src="icons.rocketLaunch"
              alt=""
              class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-foreground"
                >Launch Echo at login</span
              >
              <span class="block text-left text-sm text-muted"
                >Registers a platform login entry for this user account.</span
              >
            </span>
          </span>
          <span
            :class="
              launchAtLogin ? 'toggle-pill toggle-pill--on' : 'toggle-pill'
            "
          />
        </button>

        <button
          type="button"
          class="settings-toggle"
          @click="onGlobalBringFrontToggle"
        >
          <span class="flex min-w-0 flex-1 items-start gap-3">
            <img
              :src="icons.sliders"
              alt=""
              class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-foreground"
                >Global shortcut: bring Echo to front</span
              >
              <span class="block text-left text-sm text-muted"
                >Uses Ctrl+Shift+E (Windows/Linux) or ⌘+Shift+E (macOS). Turn
                off if it conflicts with another app.</span
              >
            </span>
          </span>
          <span
            :class="
              globalBringFront ? 'toggle-pill toggle-pill--on' : 'toggle-pill'
            "
          />
        </button>

        <div class="rounded-xl border border-border bg-scrim-1 px-3 py-2.5">
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="rounded-lg bg-glass-2 px-3 py-2 text-sm font-semibold text-foreground hover:bg-glass-3 disabled:opacity-50"
              :disabled="updateBusy"
              @click="onCheckForUpdates"
            >
              {{ updateBusy ? 'Checking…' : 'Check for updates' }}
            </button>
            <span v-if="updateHint" class="text-xs text-fg-subtle">{{
              updateHint
            }}</span>
          </div>
          <p class="mt-2 text-xs text-fg-subtle">
            Requires a hosted Tauri update manifest and signing keys; see
            desktop operations docs.
          </p>
        </div>

        <button
          type="button"
          class="settings-toggle"
          @click="void bringMainWindowToForeground()"
        >
          <span class="flex min-w-0 flex-1 items-start gap-3">
            <img
              :src="icons.messageAlt"
              alt=""
              class="mt-0.5 h-5 w-5 shrink-0 opacity-80 filter invert"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-foreground"
                >Bring Echo to front</span
              >
              <span class="block text-left text-sm text-muted"
                >Useful if the window is behind other apps after a
                notification.</span
              >
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
