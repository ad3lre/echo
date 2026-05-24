import { describe, expect, it } from 'vitest';
import {
  chatAudioContentTypeForPresign,
  chatImageContentTypeForPresign,
  chatVideoContentTypeForPresign,
  inferChatPendingMediaKind,
  isChatAudioUpload,
  isChatVideoUpload,
  resolveChatUploadContentTypeAndKind,
} from './chatUploadMediaTypes';

function file(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe('chatUploadMediaTypes', () => {
  it('accepts Windows-style application/octet-stream when extension is audio', () => {
    expect(
      isChatAudioUpload(file('ringtone.mp3', 'application/octet-stream')),
    ).toBe(true);
    expect(
      isChatAudioUpload(file('alert.wav', 'application/octet-stream')),
    ).toBe(true);
  });

  it('classifies iOS-style empty MIME + extension', () => {
    expect(isChatVideoUpload(file('clip.mov', ''))).toBe(true);
    expect(isChatVideoUpload(file('clip.mp4', ''))).toBe(true);
    expect(isChatAudioUpload(file('memo.m4a', ''))).toBe(true);
    expect(inferChatPendingMediaKind(file('IMG_0001.HEIC', ''))).toBe('image');
    expect(inferChatPendingMediaKind(file('clip.mov', ''))).toBe('video');
    expect(inferChatPendingMediaKind(file('memo.m4a', ''))).toBe('audio');
  });

  it('presign helpers map empty audio/video/image types', () => {
    expect(chatVideoContentTypeForPresign(file('a.mov', ''))).toBe(
      'video/quicktime',
    );
    expect(chatAudioContentTypeForPresign(file('a.m4a', ''))).toBe('audio/mp4');
    expect(chatImageContentTypeForPresign(file('x.HEIC', ''))).toBe(
      'image/heic',
    );
  });

  it('resolveChatUploadContentTypeAndKind prefers video when extension matches', () => {
    const v = resolveChatUploadContentTypeAndKind(file('a.mp4', ''));
    expect(v.kind).toBe('video');
    expect(v.contentType).toBe('video/mp4');
    const img = resolveChatUploadContentTypeAndKind(file('a.jpg', ''));
    expect(img.kind).toBe('image');
    expect(img.contentType).toBe('image/jpeg');
  });
});
