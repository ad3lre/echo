import assert from 'node:assert/strict';
import { mayLinkAppleByEmail } from './appleEmailLink';

assert.equal(mayLinkAppleByEmail(true, { emailVerified: true }), true);
// Unverified local account (pre-hijack): never link.
assert.equal(mayLinkAppleByEmail(true, { emailVerified: false }), false);
// Apple did not assert verification: never link.
assert.equal(mayLinkAppleByEmail(false, { emailVerified: true }), false);
assert.equal(mayLinkAppleByEmail(false, { emailVerified: false }), false);
console.log('appleEmailLink.test.ts: ok');
