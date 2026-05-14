import assert from 'node:assert/strict';
import { mergeOverrideRows } from '../domain/mergeOverrideRows';

function run() {
  const rowsUnsorted = [
    { id: 'b', position: 1, body: { VIEW_CHANNEL: false } },
    { id: 'a', position: 0, body: { VIEW_CHANNEL: true } },
  ];
  const rowsSorted = [...rowsUnsorted].sort((x, y) => {
    if (x.position !== y.position) return x.position - y.position;
    return x.id.localeCompare(y.id);
  });

  const mergedDefault = mergeOverrideRows(rowsUnsorted);
  const mergedPresorted = mergeOverrideRows(rowsSorted, { presorted: true });
  const mergedFromUnsortedPresortedFlag = mergeOverrideRows(rowsUnsorted, {
    presorted: true,
  });

  // Results should be identical regardless of ordering when presorted flag is used correctly by callers.
  assert.deepEqual(mergedDefault, mergedPresorted);
  assert.deepEqual(mergedDefault, mergedFromUnsortedPresortedFlag);

  console.log('echo.mergeOverrideRows.presort: ok');
}

run();
