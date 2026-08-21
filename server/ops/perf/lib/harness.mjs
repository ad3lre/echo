/** @param {import('@playwright/test').Page} page */
export async function resetHarness(page) {
  await page.evaluate(() => {
    window.__echoPerf?.reset?.();
  });
}

/** @param {import('@playwright/test').Page} page */
export async function readHarnessReport(page) {
  return page.evaluate(() => {
    if (window.__echoPerf?.getReport) {
      return window.__echoPerf.getReport();
    }
    return {
      milestones: {},
      events: [],
      measures: [],
      meta: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        recordedAt: new Date().toISOString(),
        scenarioOriginMs: 0,
        harnessMissing: true,
      },
    };
  });
}

/** @param {Record<string, number>} target @param {Record<string, number>} source */
export function mergeHarnessMilestones(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (Number.isFinite(value)) target[key] = value;
  }
  return target;
}

/** @param {import('@playwright/test').Page} page */
export async function waitForAppShell(page) {
  await page.locator('[data-cy=app-layout]').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  await page
    .locator('.echo-boot-gate')
    .waitFor({ state: 'hidden', timeout: 15_000 });
}

/** @param {import('@playwright/test').Page} page */
export async function waitForChatReady(page) {
  await page.locator('[data-cy=message-list]').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  const skeletonGone = page.locator('[data-cy=chat-skeleton-gone]');
  const overlay = page.locator('.message-list-skeleton-overlay');
  if (await skeletonGone.count()) {
    await skeletonGone.waitFor({ state: 'attached', timeout: 60_000 });
  } else {
    await overlay
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(async () => {
        await expectOverlayGone(page);
      });
  }
}

/** @param {import('@playwright/test').Page} page */
async function expectOverlayGone(page) {
  await page.waitForFunction(
    () => !document.querySelector('.message-list-skeleton-overlay'),
    undefined,
    { timeout: 60_000 },
  );
}

/** @param {import('@playwright/test').Page} page */
export async function disableCacheForPage(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
}

/** @param {import('@playwright/test').Page} page */
export async function dismissVoicePreflightIfPresent(page) {
  const joinMuted = page.getByRole('button', { name: /^Join muted$/i });
  if (await joinMuted.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await joinMuted.click();
  }
}

/** @param {import('@playwright/test').Page} page */
export async function dismissBlockingDialogs(page) {
  const ok = page.getByRole('button', { name: /^OK$/i });
  if (await ok.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await ok.click();
  }
  await dismissVoicePreflightIfPresent(page);
}

/** @param {import('@playwright/test').Page} page */
export async function waitForVcConnected(page) {
  await page.waitForFunction(
    () => {
      const labels = Array.from(
        document.querySelectorAll('.vc-voice-status-label--connected'),
      );
      return labels.some((el) => /voice connected/i.test(el.textContent ?? ''));
    },
    undefined,
    { timeout: 60_000 },
  );
}

/** @param {import('@playwright/test').Page} page */
export async function readNavigationTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return {};
    return {
      boot_spinner_visible: 0,
      boot_vue_mounted: Math.round(nav.domContentLoadedEventEnd),
      boot_shell_visible: Math.round(
        nav.loadEventEnd || nav.domContentLoadedEventEnd,
      ),
    };
  });
}
