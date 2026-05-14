import { describe, expect, it } from 'vitest';
import { echoUploadPutCredentialPlan } from './uploads';

describe('echoUploadPutCredentialPlan', () => {
  it('uses credentials + CSRF when PUT origin matches the page', () => {
    expect(
      echoUploadPutCredentialPlan({
        resolvedPutUrl:
          'https://chat.example.com/api/v1/echo/uploads/local/put',
        windowOrigin: 'https://chat.example.com',
        apiBase: 'https://api.example.com',
      }),
    ).toEqual({ includeCredentials: true, includeCsrf: true });
  });

  it('uses credentials without CSRF for Echo API PUT when page is desktop shell', () => {
    expect(
      echoUploadPutCredentialPlan({
        resolvedPutUrl: 'https://api.example.com/api/v1/echo/uploads/local/put',
        windowOrigin: 'https://tauri.localhost',
        apiBase: 'https://api.example.com',
      }),
    ).toEqual({ includeCredentials: true, includeCsrf: false });
  });

  it('omits credentials for presigned object storage PUT', () => {
    expect(
      echoUploadPutCredentialPlan({
        resolvedPutUrl:
          'https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256',
        windowOrigin: 'https://tauri.localhost',
        apiBase: 'https://api.example.com',
      }),
    ).toEqual({ includeCredentials: false, includeCsrf: false });
  });
});
