import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerEchoSocketWarmConnect,
  warmEchoSocketConnect,
} from './echoSocketWarmConnect';

describe('warmEchoSocketConnect', () => {
  afterEach(() => registerEchoSocketWarmConnect(null));

  it('handles rejected opportunistic connection setup', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('socket unavailable'));
    registerEchoSocketWarmConnect(connect);
    expect(() => warmEchoSocketConnect()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
  });
});
