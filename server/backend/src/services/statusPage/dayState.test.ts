import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dayStateFromBucket,
  latestStateFromProbe,
  uptimePercentFromBuckets,
  worstComponentState,
} from './dayState';

test('dayStateFromBucket maps uptime ratio to day status', () => {
  assert.equal(
    dayStateFromBucket({
      dayUtc: '2026-01-01',
      probeTotal: 100,
      probeUp: 100,
      probeDegraded: 0,
    }),
    'operational',
  );
  assert.equal(
    dayStateFromBucket({
      dayUtc: '2026-01-01',
      probeTotal: 100,
      probeUp: 100,
      probeDegraded: 3,
    }),
    'degraded',
  );
  assert.equal(
    dayStateFromBucket({
      dayUtc: '2026-01-01',
      probeTotal: 100,
      probeUp: 92,
      probeDegraded: 0,
    }),
    'degraded',
  );
  assert.equal(
    dayStateFromBucket({
      dayUtc: '2026-01-01',
      probeTotal: 100,
      probeUp: 60,
      probeDegraded: 0,
    }),
    'partial_outage',
  );
  assert.equal(dayStateFromBucket(null), 'no_data');
});

test('latestStateFromProbe and worstComponentState', () => {
  assert.equal(latestStateFromProbe(true, false), 'operational');
  assert.equal(latestStateFromProbe(true, true), 'degraded');
  assert.equal(latestStateFromProbe(false, false), 'major_outage');
  assert.equal(
    worstComponentState(['operational', 'degraded', 'operational']),
    'degraded',
  );
});

test('uptimePercentFromBuckets', () => {
  assert.equal(
    uptimePercentFromBuckets([
      { dayUtc: 'a', probeTotal: 10, probeUp: 10, probeDegraded: 0 },
      { dayUtc: 'b', probeTotal: 10, probeUp: 9, probeDegraded: 0 },
    ]),
    95,
  );
});
