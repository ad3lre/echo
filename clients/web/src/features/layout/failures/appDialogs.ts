import { randomUuidV4 } from '@/features/layout/ids/randomUuid';

export const ECHO_APP_DIALOG_REQUEST_EVENT = 'echo-app-dialog-request';
export const ECHO_APP_DIALOG_RESPONSE_EVENT = 'echo-app-dialog-response';

export type AppDialogKind = 'alert' | 'confirm' | 'prompt' | 'twoChoice';

export type AppDialogRequest =
  | {
      id: string;
      kind: 'alert';
      title: string;
      message?: string;
      confirmLabel?: string;
      danger?: boolean;
    }
  | {
      id: string;
      kind: 'confirm';
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
    }
  | {
      id: string;
      kind: 'prompt';
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      placeholder?: string;
      initialValue?: string;
      danger?: boolean;
    }
  | {
      id: string;
      kind: 'twoChoice';
      title: string;
      message?: string;
      primaryLabel: string;
      secondaryLabel: string;
      dismissLabel?: string;
      danger?: boolean;
      /** Wider modal with icon cards instead of a compact button row. */
      layout?: 'choices';
      primaryDescription?: string;
      secondaryDescription?: string;
      primaryIconSrc?: string;
      secondaryIconSrc?: string;
    };

export type AppDialogResponse =
  | { id: string; kind: 'alert'; ok: true }
  | { id: string; kind: 'confirm'; ok: boolean }
  | { id: string; kind: 'prompt'; value: string | null }
  | {
      id: string;
      kind: 'twoChoice';
      choice: 'primary' | 'secondary' | null;
    };

const pending = new Map<string, (r: AppDialogResponse) => void>();
let responseListenerInstalled = false;

function ensureResponseListener(): void {
  if (typeof window === 'undefined') return;
  if (responseListenerInstalled) return;
  responseListenerInstalled = true;

  window.addEventListener(ECHO_APP_DIALOG_RESPONSE_EVENT, (e: Event) => {
    const ce = e as CustomEvent<AppDialogResponse>;
    const id = ce.detail?.id;
    if (!id) return;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(ce.detail);
  });
}

function newDialogId(): string {
  return randomUuidV4();
}

function dispatchDialogRequest(req: AppDialogRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AppDialogRequest>(ECHO_APP_DIALOG_REQUEST_EVENT, {
      detail: req,
    }),
  );
}

export type AppConfirmPayload = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Open dialogs after the current pointer/click gesture completes.
 * Right-click menu items otherwise mount the backdrop under the same click,
 * which immediately hits @click.self cancel on AppLayoutDialogHost.
 */
function deferDialogDispatch(dispatch: () => void): void {
  if (typeof window === 'undefined') {
    dispatch();
    return;
  }
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(dispatch);
    });
  });
}

export function dispatchAppDialogResponse(res: AppDialogResponse): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AppDialogResponse>(ECHO_APP_DIALOG_RESPONSE_EVENT, {
      detail: res,
    }),
  );
}

export function subscribeAppDialogs(
  handler: (req: AppDialogRequest) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<AppDialogRequest>;
    if (!ce.detail?.id || !ce.detail?.kind || !ce.detail?.title) return;
    handler(ce.detail);
  };
  window.addEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, fn);
  return () => window.removeEventListener(ECHO_APP_DIALOG_REQUEST_EVENT, fn);
}

export function requestAppConfirm(
  payload: AppConfirmPayload,
): Promise<boolean> {
  ensureResponseListener();
  const id = newDialogId();
  const req: Extract<AppDialogRequest, { kind: 'confirm' }> = {
    id,
    kind: 'confirm',
    title: payload.title,
    ...(payload.message?.trim() ? { message: payload.message.trim() } : {}),
    ...(payload.confirmLabel?.trim()
      ? { confirmLabel: payload.confirmLabel.trim() }
      : {}),
    ...(payload.cancelLabel?.trim()
      ? { cancelLabel: payload.cancelLabel.trim() }
      : {}),
    ...(payload.danger ? { danger: true } : {}),
  };

  return new Promise<boolean>((resolve) => {
    pending.set(id, (r) => resolve(r.kind === 'confirm' ? r.ok : false));
    deferDialogDispatch(() => dispatchDialogRequest(req));
  });
}

/**
 * Show confirm from a teleported context menu without closing the menu first.
 * Closing before confirm unmounts the menu during the same pointer gesture, which
 * can drop the click and auto-dismiss the dialog backdrop (@click.self on
 * AppLayoutDialogHost). deferDialogDispatch handles dialog open timing; the menu
 * closes after the user confirms or cancels.
 */
export async function requestAppConfirmFromContextMenu(
  closeMenu: () => void,
  payload: AppConfirmPayload,
): Promise<boolean> {
  const ok = await requestAppConfirm(payload);
  closeMenu();
  return ok;
}

export function requestAppAlert(payload: {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<void> {
  ensureResponseListener();
  const id = newDialogId();
  const req: Extract<AppDialogRequest, { kind: 'alert' }> = {
    id,
    kind: 'alert',
    title: payload.title,
    ...(payload.message?.trim() ? { message: payload.message.trim() } : {}),
    ...(payload.confirmLabel?.trim()
      ? { confirmLabel: payload.confirmLabel.trim() }
      : {}),
    ...(payload.danger ? { danger: true } : {}),
  };
  return new Promise<void>((resolve) => {
    pending.set(id, () => resolve());
    deferDialogDispatch(() => dispatchDialogRequest(req));
  });
}

export function requestAppPrompt(payload: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  initialValue?: string;
}): Promise<string | null> {
  ensureResponseListener();
  const id = newDialogId();
  const req: Extract<AppDialogRequest, { kind: 'prompt' }> = {
    id,
    kind: 'prompt',
    title: payload.title,
    ...(payload.message?.trim() ? { message: payload.message.trim() } : {}),
    ...(payload.confirmLabel?.trim()
      ? { confirmLabel: payload.confirmLabel.trim() }
      : {}),
    ...(payload.cancelLabel?.trim()
      ? { cancelLabel: payload.cancelLabel.trim() }
      : {}),
    ...(payload.placeholder?.trim()
      ? { placeholder: payload.placeholder.trim() }
      : {}),
    ...(payload.initialValue !== undefined
      ? { initialValue: payload.initialValue }
      : {}),
  };
  return new Promise<string | null>((resolve) => {
    pending.set(id, (r) => resolve(r.kind === 'prompt' ? r.value : null));
    deferDialogDispatch(() => dispatchDialogRequest(req));
  });
}

export function requestAppTwoChoice(payload: {
  title: string;
  message?: string;
  primaryLabel: string;
  secondaryLabel: string;
  dismissLabel?: string;
  danger?: boolean;
  layout?: 'choices';
  primaryDescription?: string;
  secondaryDescription?: string;
  primaryIconSrc?: string;
  secondaryIconSrc?: string;
}): Promise<'primary' | 'secondary' | null> {
  ensureResponseListener();
  const id = newDialogId();
  const req: Extract<AppDialogRequest, { kind: 'twoChoice' }> = {
    id,
    kind: 'twoChoice',
    title: payload.title,
    primaryLabel: payload.primaryLabel.trim(),
    secondaryLabel: payload.secondaryLabel.trim(),
    ...(payload.message?.trim() ? { message: payload.message.trim() } : {}),
    ...(payload.dismissLabel?.trim()
      ? { dismissLabel: payload.dismissLabel.trim() }
      : {}),
    ...(payload.danger ? { danger: true } : {}),
    ...(payload.layout === 'choices' ? { layout: 'choices' as const } : {}),
    ...(payload.primaryDescription?.trim()
      ? { primaryDescription: payload.primaryDescription.trim() }
      : {}),
    ...(payload.secondaryDescription?.trim()
      ? { secondaryDescription: payload.secondaryDescription.trim() }
      : {}),
    ...(payload.primaryIconSrc?.trim()
      ? { primaryIconSrc: payload.primaryIconSrc.trim() }
      : {}),
    ...(payload.secondaryIconSrc?.trim()
      ? { secondaryIconSrc: payload.secondaryIconSrc.trim() }
      : {}),
  };
  return new Promise<'primary' | 'secondary' | null>((resolve) => {
    pending.set(id, (r) => {
      if (r.kind !== 'twoChoice') {
        resolve(null);
        return;
      }
      resolve(r.choice);
    });
    deferDialogDispatch(() => dispatchDialogRequest(req));
  });
}
