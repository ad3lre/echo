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
  const controls = 'a\u0000b\u0000c\u001fd\u007fe';
  assert.equal(sanitizeProfileCustomStatus(controls), 'abcde');
  assert.equal(sanitizeProfileBio(controls), 'abcde');
  assert.deepEqual(validateDisplayName(controls, 'fallback'), {
    ok: true,
    displayName: 'abcde',
  });
  assert.equal(
    sanitizeProfileCustomStatus(controls),
    'abcde',
    'repeat calls stay stateless',
  );
  assert.equal(stripProfileHtmlMarkup('<<script>alert(1)</script>>x'), '<>x');

  const display = validateDisplayName('<i>Alice</i>', 'fallback');
  assert.equal(display.ok, true);
  if (display.ok) assert.equal(display.displayName, 'Alice');

  console.log('accountPolicy.profileSanitize: ok');
}

run();
