import assert from 'node:assert/strict';
import type pg from 'pg';
import {
  canUserReceiveServerWorkspaceEvent,
  resetEchoWorkspaceEventAccessDepsForTests,
  setEchoWorkspaceEventAccessDepsForTests,
} from './echoWorkspaceEventAccess';
import type { EchoWorkspaceEvent } from '../../../../../contracts/types/socket';

async function run(): Promise<void> {
  const memberIds = new Set<string>(['u_member']);
  const viewable = new Set<string>();

  setEchoWorkspaceEventAccessDepsForTests({
    isMemberOfServer: async (_pool, _serverId, userId) => memberIds.has(userId),
    canUserAccessChannel: async (_pool, userId, channelId) =>
      memberIds.has(userId) && viewable.has(channelId),
  });

  try {
    const pool = {} as pg.Pool;
    const mediaKey: EchoWorkspaceEvent = {
      kind: 'voice_media_key',
      version: '1',
      serverId: 'srv1',
      voiceChannelId: 'vc_staff',
      voiceMediaKey: {
        serverId: 'srv1',
        channelId: 'vc_staff',
        senderUserId: 'mod',
        keyIndex: 1,
      },
    };

    assert.equal(
      await canUserReceiveServerWorkspaceEvent(
        pool,
        'srv1',
        'u_outsider',
        mediaKey,
      ),
      false,
    );
    assert.equal(
      await canUserReceiveServerWorkspaceEvent(
        pool,
        'srv1',
        'u_member',
        mediaKey,
      ),
      false,
      'member without VIEW_CHANNEL must not see private VC media-key activity',
    );
    viewable.add('vc_staff');
    assert.equal(
      await canUserReceiveServerWorkspaceEvent(
        pool,
        'srv1',
        'u_member',
        mediaKey,
      ),
      true,
    );

    const welcome: EchoWorkspaceEvent = {
      kind: 'voice_mls_message',
      version: '2',
      serverId: 'srv1',
      voiceChannelId: 'vc_staff',
      voiceMls: {
        serverId: 'srv1',
        channelId: 'vc_staff',
        groupId: 'g',
        seq: '1',
        epoch: '1',
        msgType: 'welcome',
        recipientUserId: 'u_other',
      },
    };
    assert.equal(
      await canUserReceiveServerWorkspaceEvent(
        pool,
        'srv1',
        'u_member',
        welcome,
      ),
      false,
    );
    memberIds.add('u_other');
    assert.equal(
      await canUserReceiveServerWorkspaceEvent(
        pool,
        'srv1',
        'u_other',
        welcome,
      ),
      true,
    );
  } finally {
    resetEchoWorkspaceEventAccessDepsForTests();
  }

  console.log('echo.workspaceEventVoiceAccess.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
