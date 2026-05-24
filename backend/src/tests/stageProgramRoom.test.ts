import assert from 'node:assert/strict';
import {
  buildStageProgramRoomMetadata,
  type EchoStageProgramRoomMetadata,
} from '../services/stage/stageProgramRoom';
import {
  isStageEgressLayout,
  resolveStageEgressCustomBaseUrl,
} from '../services/livekit/livekitEgress';

function run(): void {
  const meta = buildStageProgramRoomMetadata({
    speakerIds: ['u1', 'u2'],
    layout: 'spotlight',
    pinnedIdentity: 'u1',
  });
  const parsed = JSON.parse(meta) as EchoStageProgramRoomMetadata;
  assert.deepEqual(parsed.echoStageProgram.speakerIds, ['u1', 'u2']);
  assert.equal(parsed.echoStageProgram.layout, 'spotlight');
  assert.equal(parsed.echoStageProgram.pinnedIdentity, 'u1');

  assert.ok(isStageEgressLayout('grid'));
  assert.ok(!isStageEgressLayout('invalid'));

  const url = resolveStageEgressCustomBaseUrl();
  if (process.env.ECHO_APP_PUBLIC_URL?.startsWith('http')) {
    assert.ok(url?.includes('/egress/stage-program/'));
  }

  console.log('stageProgramRoom tests passed');
}

run();
