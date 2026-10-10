import { expect, it } from 'vitest';
import {
  ADEL_APPROVAL_SCORE_WEIGHTS,
  calculateMarketingPollScores,
} from './marketingPollScoring';

it('derives overall and category scores from canonical answers', () => {
  const best = ADEL_APPROVAL_SCORE_WEIGHTS.map((q) => q.scores.indexOf(4));
  const worst = ADEL_APPROVAL_SCORE_WEIGHTS.map((q) =>
    q.scores.indexOf(Math.min(...q.scores)),
  );
  expect(calculateMarketingPollScores(best).score).toBe(100);
  expect(
    Object.values(calculateMarketingPollScores(best).categoryScores),
  ).toEqual(Array(10).fill(100));
  expect(calculateMarketingPollScores(worst).score).toBeLessThan(30);
  expect(() => calculateMarketingPollScores(Array(50).fill(4))).toThrow(
    'invalid_answers',
  );
  expect(() => calculateMarketingPollScores([])).toThrow('invalid_answers');
});
