import { describe, expect, it } from 'vitest';
import { LoadTimeoutError, withTimeout } from '@/features/pdf/withTimeout';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'test')).resolves.toBe(
      42,
    );
  });

  it('rejects with LoadTimeoutError when the promise is slow', async () => {
    await expect(
      withTimeout(new Promise(() => {}), 20, 'PDF load'),
    ).rejects.toBeInstanceOf(LoadTimeoutError);
  });
});
