import assert from 'node:assert/strict';
import {
  mergeRoleUiPermissionsWithStoredEcho,
  roleUiPermissionsToEchoStrings,
} from '../../../shared/rolePermissionBridge';

async function run(): Promise<void> {
  const uiBase = {
    viewChannels: true,
    sendMessages: true,
    manageChannels: false,
    manageRoles: false,
    assignRoles: false,
    addExpressions: true,
    manageExpressions: false,
    viewAuditLog: false,
    viewServerStats: true,
    manageServer: false,
    createInvite: true,
    changeNickname: true,
    manageNicknames: false,
    manageApprovals: false,
    kickMembers: false,
    banMembers: false,
    timeoutMembers: false,
    sendMedia: true,
    mentionEveryone: false,
    mentionActive: false,
    manageMessages: false,
    readMessageHistory: true,
    createPolls: true,
    commentOnPaper: true,
    manageTickets: false,
    connectToVoice: true,
    video: true,
    muteDeafenMembers: false,
    moveMembers: false,
    setVoiceChannelStatus: false,
    administrator: false,
  };

  const storedWithHidden = [
    ...roleUiPermissionsToEchoStrings(uiBase),
    'EMBED_LINKS',
    'ADD_REACTIONS',
  ];

  const merged = mergeRoleUiPermissionsWithStoredEcho(
    { ...uiBase, sendMessages: false },
    storedWithHidden,
  );

  assert.equal(merged.includes('SEND_MESSAGES'), false);
  assert.equal(
    merged.includes('EMBED_LINKS'),
    true,
    'non-UI permission bits should survive unrelated UI toggles',
  );
  assert.equal(
    merged.includes('ADD_REACTIONS'),
    true,
    'non-UI permission bits should survive unrelated UI toggles',
  );

  const adminMerged = mergeRoleUiPermissionsWithStoredEcho(
    { ...uiBase, administrator: true },
    ['EMBED_LINKS'],
  );
  assert.equal(
    adminMerged.includes('EMBED_LINKS'),
    true,
    'administrator UI grant should not drop preserved non-UI bits',
  );

  console.log('echo.rolePermissionMerge: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
