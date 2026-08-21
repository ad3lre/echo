import { describe, expect, it } from 'vitest';
import { buildYoutubeRtmpIngestUrl } from '../../domain/youtube/youtubeRtmpIngest';

describe('buildYoutubeRtmpIngestUrl', () => {
  it('builds from server and stream key', () => {
    const r = buildYoutubeRtmpIngestUrl({
      streamKey: 'abcd-efgh-1234',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rtmpUrl).toBe('rtmp://a.rtmp.youtube.com/live2/abcd-efgh-1234');
    }
  });

  it('accepts full YouTube RTMP URL', () => {
    const r = buildYoutubeRtmpIngestUrl({
      rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-1234',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects non-YouTube hosts', () => {
    const r = buildYoutubeRtmpIngestUrl({
      rtmpUrl: 'rtmp://evil.example/live2/abcd-efgh-1234',
    });
    expect(r.ok).toBe(false);
  });
});
