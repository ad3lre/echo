import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { EchoPlanId } from '@shared/echoPlanLimits';
import {
  CALL_RINGTONE_DEFAULT_BUILTIN_ID,
  CALL_RINGTONE_ENTRIES,
  CALL_RINGTONE_PACK_ORDER,
  LEGACY_BUILTIN_RINGTONE_IDS,
  type CallRingtonePackLabel,
} from '@/audio/callRingtoneAssets';
import {
  audioRecordingFileExtensionForMimeType,
  pickSupportedAudioRecordingMimeType,
} from '@/platform/browserCompatibility';

const STORAGE_KEY = 'echo-call-ringtone-ui-v1';
export const CALL_RINGTONE_UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
const CALL_RINGTONE_COMPRESS_TRIGGER_BYTES = 2 * 1024 * 1024;

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  );
}

type PersistedCustom = {
  id: string;
  label: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

type Persisted = {
  selectedId: string;
  volumePercent: number;
  muted: boolean;
  custom: PersistedCustom[];
};

function load(): Partial<Persisted> {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Persisted>;
  } catch {
    return {};
  }
}

function persist(v: Persisted): boolean {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export type CallRingtoneLibraryEntry = {
  id: string;
  label: string;
  url: string;
  source: 'built-in' | 'custom';
  /** Present for built-in ringtones from pack folders. */
  packLabel?: CallRingtonePackLabel;
};

export type CallRingtoneOptionGroup = {
  label: string;
  entries: CallRingtoneLibraryEntry[];
};

export function maxCustomRingtonesForPlan(
  plan: EchoPlanId | null | undefined,
): number {
  if (plan === 'black') return 256;
  if (plan === 'plus') return 16;
  return 1;
}

function toBuiltInId(id: string): string {
  return `builtin:${id}`;
}

function firstBuiltInId(): string {
  const fallback = CALL_RINGTONE_ENTRIES[0]?.id ?? 'vibes:glass-wait';
  const id = CALL_RINGTONE_ENTRIES.some(
    (e) => e.id === CALL_RINGTONE_DEFAULT_BUILTIN_ID,
  )
    ? CALL_RINGTONE_DEFAULT_BUILTIN_ID
    : fallback;
  return toBuiltInId(id);
}

function normalizePersistedSelectedId(raw: string | undefined): string {
  if (typeof raw !== 'string' || !raw.trim()) return firstBuiltInId();
  let t = raw.trim();
  if (t.startsWith('builtin:')) {
    const inner = t.slice('builtin:'.length);
    const mapped = LEGACY_BUILTIN_RINGTONE_IDS[inner];
    if (mapped) t = toBuiltInId(mapped);
  }
  return t;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const out = typeof reader.result === 'string' ? reader.result : '';
      if (!out) reject(new Error('Failed to read file.'));
      else resolve(out);
    };
    reader.readAsDataURL(file);
  });
}

function extlessName(name: string): string {
  return name.replace(/\.[^/.]+$/, '') || 'Custom ringtone';
}

async function compressAudioFileIfNeeded(file: File): Promise<File> {
  if (file.size <= CALL_RINGTONE_COMPRESS_TRIGGER_BYTES) {
    return file;
  }
  if (typeof window === 'undefined') return file;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx || typeof MediaRecorder === 'undefined') return file;
  const preferredMime = pickSupportedAudioRecordingMimeType();
  if (!preferredMime) return file;

  const objectUrl = URL.createObjectURL(file);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  audio.muted = true;
  audio.volume = 0;
  audio.crossOrigin = 'anonymous';
  const ctx = new Ctx();
  try {
    const source = ctx.createMediaElementSource(audio);
    const streamDest = ctx.createMediaStreamDestination();
    source.connect(streamDest);

    let bestBlob: Blob | null = null;
    for (const bits of [128_000, 96_000, 64_000]) {
      const recorder = new MediaRecorder(streamDest.stream, {
        mimeType: preferredMime,
        audioBitsPerSecond: bits,
      });
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve, reject) => {
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onerror = () => reject(new Error('Audio compression failed.'));
        recorder.onstop = () => resolve();
        audio.currentTime = 0;
        audio.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };
        recorder.start();
        void audio.play().catch(() => {
          if (recorder.state !== 'inactive') recorder.stop();
          reject(new Error('Audio compression play failed.'));
        });
      });
      const blob = new Blob(chunks, { type: preferredMime });
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= CALL_RINGTONE_UPLOAD_MAX_BYTES) {
        bestBlob = blob;
        break;
      }
    }

    if (!bestBlob || bestBlob.size >= file.size) return file;
    const outputMime = bestBlob.type || preferredMime;
    const outputExt = audioRecordingFileExtensionForMimeType(outputMime);
    return new File([bestBlob], `${extlessName(file.name)}.${outputExt}`, {
      type: outputMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
    void ctx.close().catch(() => {});
  }
}

/** In-call ringtone library + default selection + volume + mute (persisted in browser storage). */
export const useCallRingtoneStore = defineStore('callRingtone', () => {
  const saved = load();
  const custom = ref<PersistedCustom[]>(
    Array.isArray(saved.custom) ? saved.custom : [],
  );
  const selectedId = ref(normalizePersistedSelectedId(saved.selectedId));
  const volumePercent = ref(
    typeof saved.volumePercent === 'number'
      ? Math.min(100, Math.max(0, saved.volumePercent))
      : 42,
  );
  const muted = ref(saved.muted === true);

  const entries = computed<CallRingtoneLibraryEntry[]>(() => {
    const builtIn = CALL_RINGTONE_ENTRIES.map((e) => ({
      id: toBuiltInId(e.id),
      label: e.label,
      url: e.url,
      source: 'built-in' as const,
      packLabel: e.packLabel,
    }));
    const uploaded = custom.value.map((e) => ({
      id: e.id,
      label: e.label,
      url: e.dataUrl,
      source: 'custom' as const,
    }));
    return [...builtIn, ...uploaded];
  });

  const selectedEntry = computed<CallRingtoneLibraryEntry | null>(
    () =>
      entries.value.find((e) => e.id === selectedId.value) ??
      entries.value[0] ??
      null,
  );

  const currentIndex = computed<number>(() => {
    if (!entries.value.length) return 0;
    const idx = entries.value.findIndex(
      (e) => e.id === selectedEntry.value?.id,
    );
    return idx >= 0 ? idx : 0;
  });

  const ringtoneCanStepBack = computed(
    () => entries.value.length > 1 && currentIndex.value > 0,
  );

  const ringtoneCanStepForward = computed(
    () =>
      entries.value.length > 1 && currentIndex.value < entries.value.length - 1,
  );

  const ringtoneOptionGroups = computed<CallRingtoneOptionGroup[]>(() => {
    const list = entries.value;
    const customs = list.filter((e) => e.source === 'custom');
    const builtIn = list.filter((e) => e.source === 'built-in');
    const groups: CallRingtoneOptionGroup[] = [];
    for (const pack of CALL_RINGTONE_PACK_ORDER) {
      const packEntries = builtIn.filter((e) => e.packLabel === pack);
      if (packEntries.length > 0) {
        groups.push({ label: pack, entries: packEntries });
      }
    }
    if (customs.length > 0) {
      groups.push({ label: 'Custom', entries: customs });
    }
    return groups;
  });

  watch([entries, selectedId], () => {
    const chosen = entries.value.find((e) => e.id === selectedId.value);
    if (!chosen && entries.value.length > 0) {
      selectedId.value =
        entries.value.find((e) => e.id === firstBuiltInId())?.id ??
        entries.value[0]!.id;
    }
  });

  // Debounced persistence to avoid excessive localStorage writes (e.g. volume slider).
  let persistTimeout: number | undefined;
  function schedulePersist(state: Persisted, delay = 300) {
    if (!hasLocalStorage()) return;
    if (persistTimeout) window.clearTimeout(persistTimeout);
    persistTimeout = window.setTimeout(() => {
      const ok = persist(state);
      if (!ok) console.warn('Failed to persist call ringtone state');
      persistTimeout = undefined;
    }, delay) as unknown as number;
  }

  watch(
    [selectedId, volumePercent, muted, custom],
    () => {
      schedulePersist({
        selectedId: selectedId.value,
        volumePercent: volumePercent.value,
        muted: muted.value,
        custom: custom.value,
      });
    },
    { deep: true },
  );

  function stepRingtone(delta: number) {
    const n = entries.value.length;
    if (n <= 0) return;
    const idx = currentIndex.value + delta;
    if (idx < 0 || idx >= n) return;
    const id = entries.value[idx]?.id;
    if (id) selectedId.value = id;
  }

  function setRingtoneById(id: string) {
    if (!id) return;
    if (entries.value.some((e) => e.id === id)) selectedId.value = id;
  }

  function setRingtoneIndex(i: number) {
    const n = entries.value.length;
    if (n <= 0) return;
    const idx = ((Math.round(i) % n) + n) % n;
    const id = entries.value[idx]?.id;
    if (id) selectedId.value = id;
  }

  function toggleMuted() {
    muted.value = !muted.value;
  }

  function setVolumePercent(p: number) {
    volumePercent.value = Math.min(100, Math.max(0, Math.round(p)));
  }

  async function addCustomRingtone(
    file: File,
    maxCustomCount: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!(file instanceof File)) {
      return { ok: false, reason: 'Choose an audio file first.' };
    }
    if (custom.value.length >= Math.max(0, maxCustomCount)) {
      return {
        ok: false,
        reason: `You reached your custom ringtone limit (${maxCustomCount}).`,
      };
    }
    const mime = (file.type || '').toLowerCase();
    if (mime && !mime.startsWith('audio/')) {
      return {
        ok: false,
        reason: 'Unsupported file type. Upload an audio file.',
      };
    }
    const prepared = await compressAudioFileIfNeeded(file);
    if (prepared.size > CALL_RINGTONE_UPLOAD_MAX_BYTES) {
      return { ok: false, reason: 'File too large. Max size is 6MB.' };
    }
    const dataUrl = await readFileAsDataUrl(prepared);
    const item: PersistedCustom = {
      id: `custom:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      label: extlessName(file.name),
      mimeType: prepared.type || mime || 'audio/mpeg',
      sizeBytes: prepared.size,
      dataUrl,
    };
    const next = [...custom.value, item];
    const savedOk = persist({
      selectedId: selectedId.value,
      volumePercent: volumePercent.value,
      muted: muted.value,
      custom: next,
    });
    if (!savedOk) {
      return {
        ok: false,
        reason:
          'Could not save ringtone in this browser (storage limit reached).',
      };
    }
    custom.value = next;
    selectedId.value = item.id;
    return { ok: true };
  }

  function removeCustomRingtone(id: string) {
    const idx = custom.value.findIndex((x) => x.id === id);
    if (idx < 0) return;
    custom.value = custom.value.filter((x) => x.id !== id);
    if (selectedId.value === id) {
      selectedId.value = firstBuiltInId();
    }
  }

  return {
    entries,
    ringtoneOptionGroups,
    selectedEntry,
    selectedId,
    currentIndex,
    ringtoneCanStepBack,
    ringtoneCanStepForward,
    custom,
    volumePercent,
    muted,
    stepRingtone,
    setRingtoneById,
    setRingtoneIndex,
    toggleMuted,
    setVolumePercent,
    addCustomRingtone,
    removeCustomRingtone,
  };
});
