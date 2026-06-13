// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchAppDialogResponse,
  ECHO_APP_DIALOG_REQUEST_EVENT,
  requestAppConfirmFromContextMenu,
} from '@/utils/appDialogs';

describe('requestAppConfirmFromContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens confirm before closing the menu', async () => {
    const closeMenu = vi.fn();
    const order: string[] = [];

    const requestListener = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; kind: string }>;
      if (ce.detail?.kind !== 'confirm') return;
      order.push('dialog-request');
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dispatchAppDialogResponse({
              id: ce.detail.id,
              kind: 'confirm',
              ok: true,
            });
          });
        });
      });
    };
    window.addEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, requestListener);

    try {
      const promise = requestAppConfirmFromContextMenu(closeMenu, {
        title: 'Delete channel?',
        confirmLabel: 'Delete',
        danger: true,
      });
      expect(closeMenu).not.toHaveBeenCalled();
      order.push('await-start');
      await promise;
      order.push('await-done');
      expect(closeMenu).toHaveBeenCalledTimes(1);
      expect(order.indexOf('dialog-request')).toBeLessThan(
        order.indexOf('await-done'),
      );
      expect(order.indexOf('await-done')).toBeLessThan(order.length);
    } finally {
      window.removeEventListener(
        ECHO_APP_DIALOG_REQUEST_EVENT,
        requestListener,
      );
    }
  });

  it('closes the menu after cancel', async () => {
    const closeMenu = vi.fn();

    const requestListener = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; kind: string }>;
      if (ce.detail?.kind !== 'confirm') return;
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dispatchAppDialogResponse({
              id: ce.detail.id,
              kind: 'confirm',
              ok: false,
            });
          });
        });
      });
    };
    window.addEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, requestListener);

    try {
      const ok = await requestAppConfirmFromContextMenu(closeMenu, {
        title: 'Delete category?',
      });
      expect(ok).toBe(false);
      expect(closeMenu).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(
        ECHO_APP_DIALOG_REQUEST_EVENT,
        requestListener,
      );
    }
  });
});
