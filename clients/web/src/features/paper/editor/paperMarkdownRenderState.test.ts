import { describe, expect, it, beforeEach } from 'vitest';
import {
  getPaperMarkdownRenderInline,
  setPaperMarkdownRenderInlineValue,
} from '@/features/paper/editor/paperMarkdownRenderState';

describe('paperMarkdownRenderState', () => {
  beforeEach(() => {
    setPaperMarkdownRenderInlineValue(true);
  });

  it('tracks render inline flag', () => {
    expect(getPaperMarkdownRenderInline()).toBe(true);
    setPaperMarkdownRenderInlineValue(false);
    expect(getPaperMarkdownRenderInline()).toBe(false);
  });
});
