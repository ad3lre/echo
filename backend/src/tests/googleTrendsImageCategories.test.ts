import assert from 'node:assert/strict';
import {
  buildCategoriesFromTrendTerms,
  currentUtcMonthKey,
  parseGoogleTrendsRssTitles,
  refreshImageBrowseCategoriesIfStale,
} from '../services/googleTrendsImageCategories';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Daily Search Trends</title>
    <item>
      <title>simone ashley</title>
    </item>
    <item>
      <title>NBA Finals</title>
    </item>
    <item>
      <title>simone ashley</title>
    </item>
    <item>
      <title>solar eclipse 2026</title>
    </item>
  </channel>
</rss>`;

const titles = parseGoogleTrendsRssTitles(SAMPLE_RSS);
assert.equal(titles.length, 4);
assert.equal(titles[0], 'simone ashley');

assert.equal(currentUtcMonthKey(new Date('2026-06-10T12:00:00Z')), '2026-06');

const built = buildCategoriesFromTrendTerms(titles);
assert.equal(built.length, 3);
assert.equal(built[0].slug, 'simone-ashley');
assert.equal(built[0].name, 'Simone Ashley');
assert.equal(built[0].query, 'simone ashley');
assert.ok(built[0].navEmoji.length > 0);

void refreshImageBrowseCategoriesIfStale().then((snapshot) => {
  assert.ok(snapshot.categories.length >= 4);
  assert.match(snapshot.monthKey, /^\d{4}-\d{2}$/);
  console.log('googleTrendsImageCategories.test.ts: ok');
});
