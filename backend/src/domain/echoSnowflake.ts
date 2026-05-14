/**
 * Process-local Snowflake generator for Echo public ids (ADR 002).
 */
import { createSnowflakeGenerator } from '../../../shared/snowflakeIds';
import { config } from '../config';
import {
  echoSnowflakeGeneratorSequenceObserved,
  echoSnowflakeGeneratorWaitNextMsTotal,
} from '../observability/echoMetrics';

export const nextEchoSnowflakeId = createSnowflakeGenerator({
  workerId: config.snowflakeWorkerId,
  datacenterId: config.snowflakeDatacenterId,
  onWaitNextMs: () => {
    echoSnowflakeGeneratorWaitNextMsTotal.inc();
  },
  onEmitSequence: (seq) => {
    echoSnowflakeGeneratorSequenceObserved.observe(seq);
  },
});
