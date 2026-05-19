import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { notifyMissingAction } from '@/utils/controllerMissingAction';
import type {
  AppActionRegistryDraft,
  AppActionRegistrySealed,
  AppActionRegistryRuntime,
} from './appActionRegistry.types';

/** Dot paths for `getRegistrySlot`. */
export const REQUIRED_ACTION_KEYS = [
  'message.goToMessage',
  'navigation.openDm',
  'navigation.openServerSettingsFromUrl',
  'groupDm.openGroupDMModal',
  'groupDm.handleCreateGroupDM',
  'groupDm.handleSelectGroupDM',
  'groupDm.openGroupSettingsFromHeader',
  'groupDm.openGroupOverviewPanel',
  'groupDm.handleUpdateGroupFromSettings',
] as const;

type RegistrySlotBag = Pick<
  AppActionRegistryDraft,
  'message' | 'navigation' | 'groupDm'
>;

function getRegistrySlot(registry: RegistrySlotBag, path: string): unknown {
  const [ns, key] = path.split('.');
  const bag = (registry as unknown as Record<string, Record<string, unknown>>)[
    ns
  ];
  return bag?.[key];
}

const reportedMissingKeys = new Set<string>();

function validateRequiredSlots(registry: RegistrySlotBag): void {
  for (const key of REQUIRED_ACTION_KEYS) {
    const v = getRegistrySlot(registry, key);
    if (typeof v === 'function') continue;
    if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
      throw new Error(`[AppActionRegistry] missing required action: ${key}`);
    }
    if (!reportedMissingKeys.has(key)) {
      reportedMissingKeys.add(key);
      reportPrimaryFlowFailure(
        'layout.action_missing',
        new Error(`Missing required action: ${key}`),
        { key },
      );
    }
    throw new Error(
      `[AppActionRegistry] seal aborted: missing required action: ${key}`,
    );
  }
}

function sealFromDraft(draft: AppActionRegistryDraft): AppActionRegistrySealed {
  validateRequiredSlots(draft);
  const sealed: AppActionRegistrySealed = {
    isReady: true as const,
    message: Object.freeze({
      goToMessage: draft.message.goToMessage!,
    }),
    navigation: Object.freeze({
      openDm: draft.navigation.openDm!,
      openServerSettingsFromUrl: draft.navigation.openServerSettingsFromUrl!,
    }),
    groupDm: Object.freeze({
      openGroupDMModal: draft.groupDm.openGroupDMModal!,
      handleCreateGroupDM: draft.groupDm.handleCreateGroupDM!,
      handleSelectGroupDM: draft.groupDm.handleSelectGroupDM!,
      openGroupSettingsFromHeader: draft.groupDm.openGroupSettingsFromHeader!,
      openGroupOverviewPanel: draft.groupDm.openGroupOverviewPanel!,
      handleUpdateGroupFromSettings:
        draft.groupDm.handleUpdateGroupFromSettings!,
    }),
  };
  return Object.freeze(sealed);
}

export function createAppActionRegistryBuild(): {
  draft: AppActionRegistryDraft;
  seal: () => AppActionRegistrySealed;
} {
  let sealed = false;
  const draft: AppActionRegistryDraft = {
    isReady: false as const,
    message: {},
    navigation: {},
    groupDm: {},
  };
  return {
    draft,
    seal(): AppActionRegistrySealed {
      if (sealed) {
        throw new Error('[AppActionRegistry] seal() called more than once');
      }
      sealed = true;
      return sealFromDraft(draft);
    },
  };
}

/**
 * Stable reference for search/pins: reads current registry from `getRegistry()`.
 * Before `isReady === true`, dev/staging throws; prod reports primary-flow failure.
 *
 * RUN-15: Delegate resolves `goToMessage` at **call time**, so handlers are not stale after seal.
 * Remaining risk: user action before `seal()` (init-before-seal) — mitigated by dev/staging throw
 * and prod `notifyMissingAction`; avoid moving search/pins onto a closure captured before seal.
 */
export function createStableGoToMessageDelegate(
  getRegistry: () => AppActionRegistryRuntime,
) {
  return (channelId: string, messageId: string) => {
    const reg = getRegistry();
    if (!reg.isReady) {
      if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
        throw new Error(
          '[AppActionRegistry] Registry not ready (seal after wiring)',
        );
      }
      notifyMissingAction('layout.registry_not_ready', 'required_binding');
      return;
    }
    reg.message.goToMessage(channelId, messageId);
  };
}

/** Test helper: validate draft slots without freezing (same rules as `seal`). */
export function assertAppActionRegistryComplete(
  draft: AppActionRegistryDraft,
): void {
  validateRequiredSlots(draft);
}
