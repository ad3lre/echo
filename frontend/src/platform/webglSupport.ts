/**
 * Detect whether this browser/device can run hardware-accelerated WebGL.
 *
 * Echo embeds heavy third-party Unity/WebGL games (Krunker, Smash Karts, Cluster Rush,
 * Goober Dash) in cross-origin iframes. When WebGL is missing, blocklisted, or falls back to
 * a software rasterizer (SwiftShader / llvmpipe), those games either fail to start, render a
 * black canvas, or crash the GPU process — which previously surfaced as a broken iframe and,
 * when the crash propagated, kicked the user out of voice. We can't see inside the cross-origin
 * game, but the host page shares the same GPU/WebGL stack, so probing here is a reliable gate.
 *
 * The probe is cheap but not free (creates + tears down a GL context), so the result is cached.
 */

export type WebglLevel = 'webgl2' | 'webgl1' | 'none';

export type WebglSupport = {
  /** True only when a non-software GL context is available. */
  ok: boolean;
  level: WebglLevel;
  /** A context exists but is backed by a software rasterizer (poor for heavy 3D). */
  software: boolean;
  /** Unmasked renderer string when exposed (diagnostics only). */
  renderer: string;
  /** Machine-readable reason for `ok === false`. */
  reason:
    | 'ok'
    | 'no-document'
    | 'no-webgl-context'
    | 'software-renderer'
    | 'context-lost'
    | 'exception';
};

const SOFTWARE_RENDERER_HINTS = [
  'swiftshader',
  'software',
  'llvmpipe',
  'softpipe',
  'microsoft basic render',
  'google swiftshader',
];

function loseContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): void {
  try {
    const ext = gl?.getExtension('WEBGL_lose_context') as {
      loseContext?: () => void;
    } | null;
    ext?.loseContext?.();
  } catch {
    /* ignore */
  }
}

type ProbeContext = {
  gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  level: WebglLevel;
};

function acquireProbeContext(canvas: HTMLCanvasElement): ProbeContext {
  const gl2 = canvas.getContext('webgl2');
  if (gl2) return { gl: gl2 as WebGL2RenderingContext, level: 'webgl2' };
  const gl1 =
    (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
  if (gl1) return { gl: gl1, level: 'webgl1' };
  return { gl: null, level: 'none' };
}

/** Unmasked renderer string when the debug extension is exposed, else ''. */
function readRenderer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL?: number;
    } | null;
    if (dbg?.UNMASKED_RENDERER_WEBGL != null) {
      return String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').trim();
    }
  } catch {
    /* extension blocked (e.g. privacy hardening) — treat as unknown renderer */
  }
  return '';
}

function failure(reason: WebglSupport['reason']): WebglSupport {
  return { ok: false, level: 'none', software: false, renderer: '', reason };
}

export function detectWebglSupport(): WebglSupport {
  if (typeof document === 'undefined') return failure('no-document');

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const probe = acquireProbeContext(document.createElement('canvas'));
    gl = probe.gl;
    if (!gl) return failure('no-webgl-context');
    if (gl.isContextLost?.() === true) {
      return { ...failure('context-lost'), level: probe.level };
    }

    const renderer = readRenderer(gl);
    const lower = renderer.toLowerCase();
    const software =
      lower.length > 0 &&
      SOFTWARE_RENDERER_HINTS.some((hint) => lower.includes(hint));

    return {
      ok: !software,
      level: probe.level,
      software,
      renderer,
      reason: software ? 'software-renderer' : 'ok',
    };
  } catch {
    return failure('exception');
  } finally {
    loseContext(gl);
  }
}

let cached: WebglSupport | null = null;

/** Cached `detectWebglSupport()` — safe to call repeatedly (e.g. in computeds). */
export function getWebglSupport(): WebglSupport {
  if (!cached) cached = detectWebglSupport();
  return cached;
}

/** Test seam. */
export function resetWebglSupportCacheForTest(): void {
  cached = null;
}

/** Human-readable explanation for a blocked WebGL launch. */
export function describeWebglBlock(support: WebglSupport): string {
  switch (support.reason) {
    case 'no-webgl-context':
      return 'This browser or device has WebGL disabled or unavailable';
    case 'software-renderer':
      return 'Your browser is rendering graphics in software (no GPU acceleration)';
    case 'context-lost':
      return 'The graphics context was lost (the GPU may have crashed or be unavailable)';
    case 'no-document':
    case 'exception':
      return 'Graphics support could not be verified on this device';
    case 'ok':
      return '';
  }
}
