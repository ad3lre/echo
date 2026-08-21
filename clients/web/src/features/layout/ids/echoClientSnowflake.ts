import { createSnowflakeGenerator } from '@shared/snowflakeIds';

/**
 * Client-side snowflake generator for message IDs.
 * Uses datacenterId=0 to distinguish from server-generated IDs (datacenterId=1+).
 * WorkerId is randomized per page load to avoid coordination between tabs.
 */
const clientWorkerId = Math.floor(Math.random() * 32);

export const nextEchoClientSnowflakeId = createSnowflakeGenerator({
  workerId: clientWorkerId,
  datacenterId: 0,
});
