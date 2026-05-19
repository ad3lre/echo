import type {
  AppActionRegistryDraft,
  AppActionRegistryMessage,
} from './appActionRegistry.types';

export type AppActionRegistryMessageWiring = Required<AppActionRegistryMessage>;

/** Fills `draft.message` before `seal()`. */
export function wireMessageIntoAppActionRegistryDraft(
  draft: AppActionRegistryDraft,
  wiring: AppActionRegistryMessageWiring,
): void {
  draft.message.goToMessage = wiring.goToMessage;
}
