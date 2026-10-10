import assert from 'node:assert/strict';
import { mergeOverrideRows } from '../../domain/permissions/mergeOverrideRows';

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
  // Callers setting `presorted` guarantee (position ASC, id ASC) ordering.
  assert.deepEqual(mergedDefault, mergedPresorted);

  console.log('echo.mergeOverrideRows.presort: ok');
}

run();
