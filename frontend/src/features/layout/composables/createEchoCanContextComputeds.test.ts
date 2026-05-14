import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createEchoCanContextComputeds } from './createEchoCanContextComputeds';

function falseRefs() {
  return {
    echoCanBanMembers: ref(false),
    echoCanChangeNicknames: ref(false),
    echoCanCreateChannel: ref(false),
    echoCanCreateInvite: ref(false),
    echoCanKickMembers: ref(false),
    echoCanManageMessages: ref(false),
    echoCanManageNicknames: ref(false),
    echoCanModerateMembers: ref(false),
    echoCanTimeoutMembers: ref(false),
  };
}

describe('createEchoCanContextComputeds', () => {
  it('mirrors role UI refs as computeds', () => {
    const roleUi = falseRefs();
    const ctx = createEchoCanContextComputeds(roleUi);

    expect(ctx.echoCanCreateChannel.value).toBe(false);
    roleUi.echoCanCreateChannel.value = true;
    expect(ctx.echoCanCreateChannel.value).toBe(true);
  });
});
