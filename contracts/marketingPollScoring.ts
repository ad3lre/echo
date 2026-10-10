/** Canonical answer weights for the Adel Approval poll, shared with the server. */
export const ADEL_APPROVAL_SCORE_WEIGHTS = [
  { category: 'Friendship', scores: [4, 1, 2, 0] },
  { category: 'Friendship', scores: [3, 4, 0, 2] },
  { category: 'Friendship', scores: [2, 1, 4, 0] },
  { category: 'Friendship', scores: [3, 0, 1, 4] },
  { category: 'Friendship', scores: [4, 2, 1, 0] },
  { category: 'Humor', scores: [2, 4, 0, 3] },
  { category: 'Humor', scores: [1, 2, 4, 3] },
  { category: 'Humor', scores: [2, 1, 0, 4] },
  { category: 'Humor', scores: [4, 3, 0, 1] },
  { category: 'Humor', scores: [0, 4, 2, 1] },
  { category: 'Thinking', scores: [1, 2, 4, 3] },
  { category: 'Thinking', scores: [1, 2, 0, 4] },
  { category: 'Thinking', scores: [4, 0, 3, 1] },
  { category: 'Thinking', scores: [2, 4, 0, 1] },
  { category: 'Thinking', scores: [1, 0, 4, 2] },
  { category: 'Judgment', scores: [0, 1, 3, 4] },
  { category: 'Judgment', scores: [4, 0, 2, 3] },
  { category: 'Judgment', scores: [1, 4, 2, 3] },
  { category: 'Judgment', scores: [0, 2, 4, 3] },
  { category: 'Judgment', scores: [0, 1, 2, 4] },
  { category: 'Emotion', scores: [4, 1, 3, 0] },
  { category: 'Emotion', scores: [0, 4, 1, 3] },
  { category: 'Emotion', scores: [1, 2, 4, 3] },
  { category: 'Emotion', scores: [3, 1, 0, 4] },
  { category: 'Emotion', scores: [4, 0, 2, 3] },
  { category: 'Freedom', scores: [0, 4, 2, 3] },
  { category: 'Freedom', scores: [0, 2, 4, 1] },
  { category: 'Freedom', scores: [0, 2, 3, 4] },
  { category: 'Freedom', scores: [4, 1, 0, 3] },
  { category: 'Freedom', scores: [0, 4, 2, 1] },
  { category: 'Community', scores: [2, 3, 4, 0] },
  { category: 'Community', scores: [3, 1, 2, 4] },
  { category: 'Community', scores: [4, 2, 1, 0] },
  { category: 'Community', scores: [1, 4, 2, 3] },
  { category: 'Community', scores: [1, 3, 4, 2] },
  { category: 'Relationships', scores: [0, 1, 2, 4] },
  { category: 'Relationships', scores: [4, 2, 1, 0] },
  { category: 'Relationships', scores: [0, 4, 2, 3] },
  { category: 'Relationships', scores: [0, 3, 4, 2] },
  { category: 'Relationships', scores: [3, 0, 1, 4] },
  { category: 'Closeness', scores: [4, 1, 0, 3] },
  { category: 'Closeness', scores: [0, 4, 2, 3] },
  { category: 'Closeness', scores: [1, 3, 4, 0] },
  { category: 'Closeness', scores: [1, 0, 3, 4] },
  { category: 'Closeness', scores: [4, 1, 2, 3] },
  { category: 'Temperament', scores: [1, 4, 0, 2] },
  { category: 'Temperament', scores: [3, 2, 4, 1] },
  { category: 'Temperament', scores: [0, 2, 1, 4] },
  { category: 'Temperament', scores: [4, 2, 3, 0] },
  { category: 'Temperament', scores: [0, 4, 2, 1] },
] as const;

export function calculateMarketingPollScores(answers: readonly number[]) {
  if (answers.length !== ADEL_APPROVAL_SCORE_WEIGHTS.length)
    throw new Error('invalid_answers');
  let total = 0;
  const categories = new Map<string, { sum: number; count: number }>();
  ADEL_APPROVAL_SCORE_WEIGHTS.forEach((question, index) => {
    const answer = answers[index]!;
    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer >= question.scores.length
    )
      throw new Error('invalid_answers');
    const value = question.scores[answer]!;
    total += value;
    const category = categories.get(question.category) ?? { sum: 0, count: 0 };
    category.sum += value;
    category.count++;
    categories.set(question.category, category);
  });
  return {
    score: Math.round((total / (answers.length * 4)) * 100),
    categoryScores: Object.fromEntries(
      [...categories].map(([name, value]) => [
        name,
        Math.round((value.sum / (value.count * 4)) * 100),
      ]),
    ),
  };
}
