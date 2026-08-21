import { ref, watch, type Ref } from 'vue';
import type { PaperDocumentPayload } from '@shared/types/paper';
import { EchoApiError } from '@/api/echo/transport';
import {
  fetchPaperDocument,
  patchPaperDocument,
} from '@/features/paper/paperApi';
import { findChangedBlocks } from '@/features/paper/editor/paperBlockMerge';

const SAVE_RETRY_ATTEMPTS = 2;
const SAVE_RETRY_BASE_MS = 400;

function isTransientSaveError(e: unknown): boolean {
  if (!(e instanceof EchoApiError)) return true;
  if (e.status === 409 || e.status === 403 || e.status === 401) return false;
  return (
    e.status >= 500 || e.status === 0 || e.status === 408 || e.status === 429
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ConflictDetails = {
  /** Server revision at time of conflict */
  serverRevision: number;
  /** Local revision we tried to save */
  localRevision: number;
  /** Blocks that changed on server */
  serverChangedBlocks: string[];
  /** Blocks that changed locally */
  localChangedBlocks: string[];
  /** Overlapping changed blocks (true conflict) */
  overlappingBlocks: string[];
};

export function usePaperDocument(channelId: Ref<string>) {
  const doc = ref<PaperDocumentPayload | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const saveRetrying = ref(false);
  const error = ref<string | null>(null);
  const conflict = ref(false);
  /** Detailed conflict info for block-level merge UI */
  const conflictDetails = ref<ConflictDetails | null>(null);
  /** Local JSON snapshot at time of conflict (for recovery) */
  const conflictLocalSnapshot = ref<Record<string, unknown> | null>(null);

  let pendingJson: Record<string, unknown> | null = null;
  let drainPromise: Promise<boolean> | null = null;

  async function load() {
    const id = channelId.value.trim();
    if (!id) return;
    loading.value = true;
    error.value = null;
    conflict.value = false;
    doc.value = null;
    try {
      doc.value = await fetchPaperDocument(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load paper';
      doc.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function patchOnce(
    contentJson: Record<string, unknown>,
  ): Promise<boolean> {
    const id = channelId.value.trim();
    const current = doc.value;
    if (!id || !current) return false;

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= SAVE_RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        saveRetrying.value = true;
        await sleep(SAVE_RETRY_BASE_MS * attempt);
      }
      try {
        doc.value = await patchPaperDocument(id, {
          contentJson,
          expectedRevision: current.revision,
        });
        error.value = null;
        conflict.value = false;
        conflictDetails.value = null;
        conflictLocalSnapshot.value = null;
        return true;
      } catch (e) {
        lastError = e;
        if (e instanceof EchoApiError && e.status === 409) {
          conflict.value = true;
          saveRetrying.value = false;
          // Save local snapshot for potential recovery
          conflictLocalSnapshot.value = JSON.parse(JSON.stringify(contentJson));
          // Load server state and compute conflict details
          const serverBefore = doc.value?.contentJson ?? null;
          await load();
          const serverAfter = doc.value?.contentJson ?? null;
          if (serverBefore && serverAfter && conflictLocalSnapshot.value) {
            const serverChanged = findChangedBlocks(serverBefore, serverAfter);
            const localChanged = findChangedBlocks(
              serverBefore,
              conflictLocalSnapshot.value,
            );
            const overlapping = [...localChanged].filter((id) =>
              serverChanged.has(id),
            );
            conflictDetails.value = {
              serverRevision: doc.value?.revision ?? 0,
              localRevision: current.revision,
              serverChangedBlocks: [...serverChanged],
              localChangedBlocks: [...localChanged],
              overlappingBlocks: overlapping,
            };
          }
          return false;
        }
        if (!isTransientSaveError(e) || attempt >= SAVE_RETRY_ATTEMPTS) {
          break;
        }
      }
    }
    saveRetrying.value = false;
    error.value =
      lastError instanceof Error ? lastError.message : 'Save failed';
    return false;
  }

  async function drainSaveQueue(): Promise<boolean> {
    saving.value = true;
    let lastOk = true;
    try {
      while (pendingJson) {
        const json = pendingJson;
        pendingJson = null;
        const revisionBefore = doc.value?.revision;
        lastOk = await patchOnce(json);
        if (!lastOk) {
          if (conflict.value && pendingJson) continue;
          return false;
        }
        if (pendingJson && doc.value?.revision === revisionBefore) {
          continue;
        }
      }
      return lastOk;
    } finally {
      saving.value = false;
      saveRetrying.value = false;
      drainPromise = null;
    }
  }

  async function save(contentJson: Record<string, unknown>): Promise<boolean> {
    const id = channelId.value.trim();
    if (!id || !doc.value) return false;
    pendingJson = contentJson;
    if (!drainPromise) {
      drainPromise = drainSaveQueue();
    }
    return drainPromise;
  }

  watch(
    channelId,
    () => {
      pendingJson = null;
      drainPromise = null;
      void load();
    },
    { immediate: true },
  );

  /** Attempt to resolve conflict by accepting local changes (retry save) */
  async function resolveConflictAcceptLocal(): Promise<boolean> {
    if (!conflictLocalSnapshot.value || !doc.value) return false;
    // Retry save with current server revision
    return await save(conflictLocalSnapshot.value);
  }

  /** Clear conflict state and accept server version */
  function resolveConflictAcceptServer(): void {
    conflict.value = false;
    conflictDetails.value = null;
    conflictLocalSnapshot.value = null;
  }

  return {
    doc,
    loading,
    saving,
    saveRetrying,
    error,
    conflict,
    conflictDetails,
    conflictLocalSnapshot,
    load,
    save,
    resolveConflictAcceptLocal,
    resolveConflictAcceptServer,
  };
}
