import { describe, expect, it } from 'vitest';
import {
  externalLinkAcknowledgmentKey,
  isTrustedExternalHost,
} from './externalLinkSafety';

describe('externalLinkSafety', () => {
  it('matches trusted hosts and subdomains', () => {
    expect(isTrustedExternalHost('www.youtube.com')).toBe(true);
    expect(isTrustedExternalHost('youtu.be')).toBe(true);
    expect(isTrustedExternalHost('evil-youtube.com')).toBe(false);
  });

  it('strips leading www for acknowledgment grouping', () => {
    expect(externalLinkAcknowledgmentKey('WWW.Example.COM')).toBe(
      'example.com',
    );
    expect(externalLinkAcknowledgmentKey('sub.example.com')).toBe(
      'sub.example.com',
    );
  });
});
