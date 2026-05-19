import assert from 'node:assert/strict';
import { buildAutomodMessageBody } from '../services/echoAutomodChannelDelivery';

function run(): void {
  const vars = {
    ruleName: 'R1',
    ruleId: 'rid',
    userId: 'uid',
    channelId: 'cid',
    messageId: 'mid',
    correlationId: 'corr',
  };
  assert.equal(
    buildAutomodMessageBody('Hello {userId} in {channelId}', vars),
    'Hello uid in cid',
  );
  assert.match(
    buildAutomodMessageBody('', vars),
    /AutoMod rule “R1” triggered for user uid/,
  );
}

run();
console.log('echo.automodChannelDelivery.test: ok');
