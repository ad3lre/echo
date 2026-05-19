import { describe, expect, it } from 'vitest';
import {
  canMemberLeaveEchoServer,
  isEchoServerOwner,
  shouldOfferLeaveServerInClientUi,
} from './echoServerOwnership';

describe('isEchoServerOwner', () => {
  it('is false when user or owner missing', () => {
    expect(isEchoServerOwner({ ownerId: 'a' }, undefined)).toBe(false);
    expect(isEchoServerOwner({ ownerId: '' }, 'a')).toBe(false);
  });

  it('is true when ids match', () => {
    expect(isEchoServerOwner({ ownerId: 'x' }, 'x')).toBe(true);
  });
});

describe('canMemberLeaveEchoServer', () => {
  it('is false for owner', () => {
    expect(canMemberLeaveEchoServer({ ownerId: 'x' }, 'x')).toBe(false);
  });

  it('is true for non-owner', () => {
    expect(canMemberLeaveEchoServer({ ownerId: 'x' }, 'y')).toBe(true);
  });
});

describe('shouldOfferLeaveServerInClientUi', () => {
  it('never offers leave for Echo home id', () => {
    expect(
      shouldOfferLeaveServerInClientUi({ id: 'echo', ownerId: 'x' }, 'x', true),
    ).toBe(false);
  });

  it('offers leave for owner when dev mode is on', () => {
    expect(
      shouldOfferLeaveServerInClientUi({ id: 'srv', ownerId: 'x' }, 'x', true),
    ).toBe(true);
  });

  it('does not offer leave for owner when dev mode is off', () => {
    expect(
      shouldOfferLeaveServerInClientUi({ id: 'srv', ownerId: 'x' }, 'x', false),
    ).toBe(false);
  });
});
