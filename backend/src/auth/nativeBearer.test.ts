import { describe, expect, it } from 'vitest';
import { isNativeBearerClient } from './nativeBearer';

function req(client: string | undefined) {
  return {
    headers: client === undefined ? {} : { 'x-echo-client': client },
  } as Parameters<typeof isNativeBearerClient>[0];
}

describe('isNativeBearerClient', () => {
  it('accepts ios and desktop client ids', () => {
    expect(isNativeBearerClient(req('ios'))).toBe(true);
    expect(isNativeBearerClient(req('desktop'))).toBe(true);
    expect(isNativeBearerClient(req('IOS'))).toBe(true);
    expect(isNativeBearerClient(req(' Desktop '))).toBe(true);
  });

  it('rejects web and unknown clients', () => {
    expect(isNativeBearerClient(req(undefined))).toBe(false);
    expect(isNativeBearerClient(req('web'))).toBe(false);
    expect(isNativeBearerClient(req('android'))).toBe(false);
  });
});
