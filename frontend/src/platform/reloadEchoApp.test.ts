// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { reloadEchoApp } from './reloadEchoApp';

describe('reloadEchoApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });

  it('uses location.reload', () => {
    reloadEchoApp();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
