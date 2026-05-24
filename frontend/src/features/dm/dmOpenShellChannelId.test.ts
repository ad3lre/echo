import { describe, expect, it } from 'vitest';
import {
  clientOnlyDmOpenShellIdForPeerUser,
  isClientOnlyDmOpenShellChannelId,
} from './dmOpenShellChannelId';

const peerSnowflake = '1492135186257805310';
const peerUuid = '11111111-1111-4111-8111-111111111111';

describe('dmOpenShellChannelId', () => {
  it('detects optimistic dm-{peerUserId} shells', () => {
    expect(
      isClientOnlyDmOpenShellChannelId(
        clientOnlyDmOpenShellIdForPeerUser(peerSnowflake),
      ),
    ).toBe(true);
    expect(
      isClientOnlyDmOpenShellChannelId(
        clientOnlyDmOpenShellIdForPeerUser(peerUuid),
      ),
    ).toBe(true);
  });

  it('does not treat legacy dm-* thread ids or persisted channels as shells', () => {
    expect(isClientOnlyDmOpenShellChannelId('dm-legacy-1')).toBe(false);
    expect(isClientOnlyDmOpenShellChannelId('dm-group-abc')).toBe(false);
    expect(isClientOnlyDmOpenShellChannelId('1492135186257805999')).toBe(false);
  });
});
