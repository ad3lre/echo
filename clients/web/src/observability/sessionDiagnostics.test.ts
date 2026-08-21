import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sessionDiagnostics optimization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps fail events and coalesces sampled successes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      addEventListener: vi.fn(),
    } as unknown as Window);
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() });

    const { emitDiagnostic } = await import('./sessionDiagnostics');

    for (let i = 0; i < 6; i += 1) {
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'http_response',
        stage: 'success',
        status: '200',
        context: {
          method: 'GET',
          path: '/api/v1/echo/presence',
          statusCode: 200,
        },
      });
    }

    emitDiagnostic({
      level: 'error',
      domain: 'api',
      event: 'http_response',
      stage: 'fail',
      status: '500',
      context: {
        method: 'GET',
        path: '/api/v1/echo/presence',
        statusCode: 500,
      },
      error: { message: 'boom' },
    });

    await vi.advanceTimersByTimeAsync(1600);

    expect(fetchMock).toHaveBeenCalled();
    const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? '');
    const payload = JSON.parse(body) as {
      events: Array<{
        event: string;
        stage?: string;
        level: string;
        context?: Record<string, unknown>;
      }>;
    };
    expect(
      payload.events.some(
        (x) =>
          x.event === 'http_response' &&
          x.stage === 'fail' &&
          x.level === 'error',
      ),
    ).toBe(true);
    expect(
      payload.events.some(
        (x) =>
          x.event === 'http_response' &&
          x.stage === 'success' &&
          Number(x.context?.count ?? 0) > 1,
      ),
    ).toBe(true);
  });
});
