import { EchoApiError } from '@/api/echo/transport';
import { uploadServerBrandingFile } from '@/api/echo/uploads';
import { isEchoGraphId } from '@/utils/echoIds';
import { UIErrorBus } from '@/utils/uiErrorBus';

/** Upload a custom automod rule icon via server branding presign (server_icon slot). */
export async function uploadAutomodRuleIcon(
  token: string,
  serverId: string,
  file: File,
): Promise<string | null> {
  const sid = serverId?.trim();
  if (!sid || !isEchoGraphId(sid)) return null;
  try {
    return await uploadServerBrandingFile(token, sid, 'server_icon', file);
  } catch (e) {
    const code =
      e instanceof EchoApiError && typeof e.body.code === 'string'
        ? e.body.code
        : undefined;
    UIErrorBus.emit({
      context: 'automod-rule-icon-upload',
      severity: 'error',
      userMessage: e instanceof Error ? e.message : 'Upload failed',
      ...(code ? { code } : {}),
    });
    return null;
  }
}
