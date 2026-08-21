import assert from 'node:assert/strict';
import {
  sanitizeProfileBio,
  sanitizeProfileCustomStatus,
  stripProfileHtmlMarkup,
  validateDisplayName,
} from '../../auth/accountPolicy';

function run(): void {
  assert.equal(
    stripProfileHtmlMarkup('<script>alert(1)</script>hello'),
    'hello',
  );
  assert.equal(
    sanitizeProfileCustomStatus('<img src=x onerror=1>away'),
    'away',
  );
  assert.equal(sanitizeProfileBio('<b>bio</b> text'), 'bio text');
  assert.equal(stripProfileHtmlMarkup('<<script>alert(1)</script>>x'), '<>x');

  const display = validateDisplayName('<i>Alice</i>', 'fallback');
  assert.equal(display.ok, true);
  if (display.ok) assert.equal(display.displayName, 'Alice');

  console.log('accountPolicy.profileSanitize: ok');
}

run();
