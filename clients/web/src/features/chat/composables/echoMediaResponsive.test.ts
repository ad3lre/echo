import { describe, expect, it } from 'vitest';
import {
  buildEchoMediaVariantUrl,
  echoMediaUrlSupportsVariants,
} from './echoMediaResponsive';

const base = 'https://media.echo.example/v1/o/echo/avatars/u1/avatar.webp';

describe('echoMediaResponsive', () => {
  it('allows variants for known raster object keys', () => {
    expect(echoMediaUrlSupportsVariants(`${base}?t=token`)).toBe(true);
    expect(
      buildEchoMediaVariantUrl(`${base}?t=token`, {
        width: 128,
      }),
    ).toBe(`${base}?t=token&w=128&f=webp`);
  });

  it('uses the original signed object for legacy keys without raster extensions', () => {
    const legacy =
      'https://media.echo.example/v1/o/echo/avatars/u1/avatar-bin?t=token';
    expect(echoMediaUrlSupportsVariants(legacy)).toBe(false);
    expect(
      buildEchoMediaVariantUrl(legacy, {
        width: 128,
      }),
    ).toBe(legacy);
  });
});
