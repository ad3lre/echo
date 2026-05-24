import { describe, it, expect } from 'vitest';
import {
  replaceRangeTransform,
  insertMentionTransform,
  wrapSelectionTransform,
} from '../composer';

describe('composer domain transforms', () => {
  it('replaceRangeTransform replaces text and shifts mentions', () => {
    const content = 'hello world';
    const mentions: any[] = [];
    const res = replaceRangeTransform(content, mentions, 6, 11, 'planet');
    expect(res.nextContent).toBe('hello planet');
    expect(res.nextSelectionStart).toBe(12);
  });

  it('insertMentionTransform inserts mention', () => {
    const content = 'hi ';
    const mentions: any[] = [];
    const res = insertMentionTransform(
      content,
      mentions,
      3,
      3,
      'user',
      'Alice',
      'u1',
    );
    expect(res.nextContent).toContain('@Alice');
  });

  it('insertMentionTransform preserves surrounding text when inserting mid-string', () => {
    const content = 'testing';
    const res = insertMentionTransform(
      content,
      [],
      4,
      4,
      'user',
      'readadel',
      'u1',
    );
    expect(res.nextContent).toBe('test@readadel ing');
  });

  it('wrapSelectionTransform wraps selection', () => {
    const content = 'bold text';
    const mentions: any[] = [];
    const res = wrapSelectionTransform(content, mentions, 0, 4, '**');
    expect(res?.nextContent).toBe('**bold** text');
  });
});
