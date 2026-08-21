import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Charter: layout composition root does not embed Echo HTTP or raw socket wiring.
 * See docs/architecture/clientCharterLayoutCompositionRootAuthority.md
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMPOSITION_ROOT_FILES = [
  'useAppLayoutController.ts',
  'createAppLayoutController.ts',
  'wireAppLayoutDmAndShell.ts',
  'wireAppLayoutVoiceAndRealtime.ts',
  'wireAppLayoutMessagingAndProfiles.ts',
  'assembleAppLayoutControllerContext.ts',
  'buildAppLayoutAssemblyDeps.ts',
] as const;

const FACADE_SRC = readFileSync(
  join(__dirname, 'useAppLayoutController.ts'),
  'utf8',
);
const SRC = COMPOSITION_ROOT_FILES.map((file) =>
  readFileSync(join(__dirname, file), 'utf8'),
).join('\n');

/** Substrings (paths / APIs) that must not appear in the composition root. */
const FORBIDDEN_SUBSTRINGS = [
  'socket.on(',
  'softMissingHandler',
  'shellLegacyNever',
  'showApiFetchErrorBanner: ref(false)',
  'activeGroupOwner: computed(() => null)',
  'chatPermissions: computed(() => ({}))',
] as const;

/** Avoid false positives on names like `prefetchEchoMessage` (substring `fetchEcho`). */
const FORBIDDEN_RX = [/\bechoFetch\s*\(/] as const;

describe('useAppLayoutController thin surface', () => {
  it('does not embed Echo HTTP or socket listeners (delegates to composables / realtime modules)', () => {
    for (const s of FORBIDDEN_SUBSTRINGS) {
      expect(
        SRC.includes(s),
        `forbidden in layout composition root: ${s}`,
      ).toBe(false);
    }
    for (const rx of FORBIDDEN_RX) {
      expect(
        rx.test(SRC),
        `forbidden pattern in layout composition root: ${rx}`,
      ).toBe(false);
    }
  });

  it('keeps useAppLayoutController.ts as a thin delegate', () => {
    expect(FACADE_SRC).toContain('createAppLayoutController');
    expect(FACADE_SRC).not.toContain('useAppLayoutEchoDmState({');
  });
});
