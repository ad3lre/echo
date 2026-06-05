import { describe, expect, it } from 'vitest';
import {
  derivePaperSurfaceStyle,
  resolvePaperPageHex,
  resolvePaperPageSurfaceStyle,
} from '@/features/paper/editor/paperPageAppearance';

describe('resolvePaperPageSurfaceStyle', () => {
  it('uses light foreground on default dark canvas when app theme is light', () => {
    const style = resolvePaperPageSurfaceStyle('dark', {
      light: '#ffffff',
      dark: null,
    });
    expect(style['--paper-surface-bg']).toBe('#16161c');
    expect(style['--paper-surface-fg']).toMatch(/255,\s*255,\s*255/);
    expect(style['--text']).toBe(style['--paper-surface-fg']);
  });

  it('keeps dark foreground on light canvas in light appearance', () => {
    const style = resolvePaperPageSurfaceStyle('light', {
      light: null,
      dark: null,
    });
    expect(style['--paper-surface-bg']).toBe('#ffffff');
    expect(style['--paper-surface-fg']).toMatch(/15,\s*23,\s*42/);
  });

  it('respects custom dark page hex from the document', () => {
    const style = resolvePaperPageSurfaceStyle('dark', {
      light: '#ffffff',
      dark: '#0f0f12',
    });
    expect(style['--paper-surface-bg']).toBe('#0f0f12');
    expect(style['--paper-surface-fg']).toMatch(/255,\s*255,\s*255/);
  });
});

describe('resolvePaperPageHex', () => {
  it('falls back to sunny default when only light color is unset', () => {
    expect(resolvePaperPageHex('sunny', { light: null, dark: null })).toBe(
      '#fffbf0',
    );
  });

  it('falls back to amoled default when only dark color is unset', () => {
    expect(resolvePaperPageHex('amoled', { light: null, dark: null })).toBe(
      '#000000',
    );
  });
});

describe('derivePaperSurfaceStyle', () => {
  it('picks readable fg for dark and light hex', () => {
    expect(derivePaperSurfaceStyle('#16161c')['--paper-surface-fg']).toMatch(
      /255,\s*255,\s*255/,
    );
    expect(derivePaperSurfaceStyle('#ffffff')['--paper-surface-fg']).toMatch(
      /15,\s*23,\s*42/,
    );
  });
});
