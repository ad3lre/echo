import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeWebglBlock,
  detectWebglSupport,
  getWebglSupport,
  resetWebglSupportCacheForTest,
  type WebglSupport,
} from './webglSupport';

const UNMASKED_RENDERER_WEBGL = 0x9246;

type FakeGlOptions = {
  /** Renderer string returned via WEBGL_debug_renderer_info. Omit to expose no debug ext. */
  renderer?: string;
  contextLost?: boolean;
};

function createFakeGl(opts: FakeGlOptions = {}) {
  const loseContext = vi.fn();
  const getExtension = vi.fn((name: string) => {
    if (name === 'WEBGL_debug_renderer_info') {
      return opts.renderer == null ? null : { UNMASKED_RENDERER_WEBGL };
    }
    if (name === 'WEBGL_lose_context') {
      return { loseContext };
    }
    return null;
  });
  const getParameter = vi.fn((pname: number) => {
    if (pname === UNMASKED_RENDERER_WEBGL) return opts.renderer ?? '';
    return '';
  });
  const isContextLost = vi.fn(() => opts.contextLost === true);
  return { getExtension, getParameter, isContextLost, loseContext };
}

type ContextMap = Partial<Record<string, unknown>>;

/**
 * Stub `document` so `createElement('canvas').getContext(type)` returns the
 * mapped context (or null). Returns the getContext spy for assertions.
 */
function stubDocument(contexts: ContextMap | (() => never)) {
  const getContext = vi.fn((type: string) => {
    if (typeof contexts === 'function') return contexts();
    return contexts[type] ?? null;
  });
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected tag ${tag}`);
      return { getContext };
    }),
  });
  return getContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetWebglSupportCacheForTest();
  vi.restoreAllMocks();
});

describe('detectWebglSupport', () => {
  it('reports a hardware webgl2 context as ok', () => {
    const gl = createFakeGl({ renderer: 'NVIDIA GeForce RTX 4090' });
    stubDocument({ webgl2: gl });

    expect(detectWebglSupport()).toEqual({
      ok: true,
      level: 'webgl2',
      software: false,
      renderer: 'NVIDIA GeForce RTX 4090',
      reason: 'ok',
    });
    // Context is always torn down.
    expect(gl.loseContext).toHaveBeenCalledTimes(1);
  });

  it('falls back to webgl1 when webgl2 is unavailable', () => {
    const gl = createFakeGl({ renderer: 'Apple M2' });
    stubDocument({ webgl: gl });

    const support = detectWebglSupport();
    expect(support.ok).toBe(true);
    expect(support.level).toBe('webgl1');
    expect(support.software).toBe(false);
    expect(support.reason).toBe('ok');
  });

  it('uses experimental-webgl as a last resort', () => {
    const gl = createFakeGl({ renderer: 'Intel Iris' });
    stubDocument({ 'experimental-webgl': gl });

    const support = detectWebglSupport();
    expect(support.level).toBe('webgl1');
    expect(support.ok).toBe(true);
  });

  it('returns no-webgl-context when getContext returns null for all', () => {
    stubDocument({});

    expect(detectWebglSupport()).toEqual({
      ok: false,
      level: 'none',
      software: false,
      renderer: '',
      reason: 'no-webgl-context',
    });
  });

  it.each(['Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)'])(
    'flags a software renderer (%s)',
    (renderer) => {
      const gl = createFakeGl({ renderer });
      stubDocument({ webgl2: gl });

      const support = detectWebglSupport();
      expect(support.ok).toBe(false);
      expect(support.software).toBe(true);
      expect(support.reason).toBe('software-renderer');
      expect(support.level).toBe('webgl2');
    },
  );

  it('reports context-lost when the GL context is already lost', () => {
    const gl = createFakeGl({ renderer: 'NVIDIA', contextLost: true });
    stubDocument({ webgl2: gl });

    const support = detectWebglSupport();
    expect(support).toEqual({
      ok: false,
      level: 'webgl2',
      software: false,
      renderer: '',
      reason: 'context-lost',
    });
  });

  it('returns exception when getContext throws', () => {
    stubDocument(() => {
      throw new Error('GPU process unavailable');
    });

    expect(detectWebglSupport()).toEqual({
      ok: false,
      level: 'none',
      software: false,
      renderer: '',
      reason: 'exception',
    });
  });

  it('treats a missing document as no-document', () => {
    // `document` left undefined (node environment); do not stub it.
    expect(detectWebglSupport().reason).toBe('no-document');
  });

  it('treats a blocked WEBGL_debug_renderer_info as an unknown (non-software) renderer', () => {
    const gl = createFakeGl(); // renderer omitted → debug ext returns null
    stubDocument({ webgl2: gl });

    const support = detectWebglSupport();
    expect(support.ok).toBe(true);
    expect(support.software).toBe(false);
    expect(support.renderer).toBe('');
    expect(support.reason).toBe('ok');
  });
});

describe('getWebglSupport (cached)', () => {
  it('probes once and reuses the cached result', () => {
    const getContext = stubDocument({
      webgl2: createFakeGl({ renderer: 'GPU' }),
    });

    const first = getWebglSupport();
    const second = getWebglSupport();

    expect(second).toBe(first);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it('re-probes after resetWebglSupportCacheForTest()', () => {
    const getContext = stubDocument({
      webgl2: createFakeGl({ renderer: 'GPU' }),
    });

    getWebglSupport();
    resetWebglSupportCacheForTest();
    getWebglSupport();

    expect(getContext).toHaveBeenCalledTimes(2);
  });
});

describe('describeWebglBlock', () => {
  const base: WebglSupport = {
    ok: false,
    level: 'none',
    software: false,
    renderer: '',
    reason: 'ok',
  };

  const nonOkReasons: WebglSupport['reason'][] = [
    'no-document',
    'no-webgl-context',
    'software-renderer',
    'context-lost',
    'exception',
  ];

  it.each(nonOkReasons)('returns a non-empty message for %s', (reason) => {
    const message = describeWebglBlock({ ...base, reason });
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });

  it('returns an empty string for ok', () => {
    expect(describeWebglBlock({ ...base, ok: true, reason: 'ok' })).toBe('');
  });
});
