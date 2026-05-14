import { describe, expect, it, vi } from 'vitest';
import {
  buildSendIntent,
  contentTypesForShellPayload,
  executeShellSend,
} from './sendIntent';

describe('executeShellSend', () => {
  it('throws when gate returns reason', () => {
    const socketSend = vi.fn();
    expect(() =>
      executeShellSend(buildSendIntent('c1', { content: 'hi' }), {
        getBlockReason: () => 'nope',
        socketSend,
      }),
    ).toThrow('nope');
    expect(socketSend).not.toHaveBeenCalled();
  });

  it('calls socket when gate allows', () => {
    const socketSend = vi.fn();
    executeShellSend(buildSendIntent('c1', { content: 'hi' }), {
      getBlockReason: () => null,
      socketSend,
    });
    expect(socketSend).toHaveBeenCalledWith(
      'c1',
      'hi',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
});

describe('contentTypesForShellPayload', () => {
  it('adds media for gif', () => {
    expect(contentTypesForShellPayload({ content: '', gif: true })).toEqual([
      'text',
      'media',
    ]);
  });
});
