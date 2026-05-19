import { describe, expect, it } from 'vitest';
import type { Server } from '@shared/types';
import { canDeleteCurrentEchoServer } from './canDeleteCurrentEchoServer';

const graphServer = (over: Partial<Server> = {}): Server =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'G',
    ownerId: 'u1',
    ...over,
  }) as Server;

describe('canDeleteCurrentEchoServer', () => {
  it('is true for echo graph server when user is owner', () => {
    expect(
      canDeleteCurrentEchoServer({
        selectedServer: graphServer(),
        currentUserId: 'u1',
      }),
    ).toBe(true);
  });

  it('is false for echo home', () => {
    expect(
      canDeleteCurrentEchoServer({
        selectedServer: graphServer({ id: 'echo' }),
        currentUserId: 'u1',
      }),
    ).toBe(false);
  });

  it('is false when not owner', () => {
    expect(
      canDeleteCurrentEchoServer({
        selectedServer: graphServer({ ownerId: 'other' }),
        currentUserId: 'u1',
      }),
    ).toBe(false);
  });
});
