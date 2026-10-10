import { getPgPool } from '../db/pg';
import { deleteIosDeviceToken } from '../domain/iosDeviceTokenRepo';

/** Remove the requesting account's device binding before its credentials are revoked. */
export async function revokeNativePushToken(
  userId: string,
  deviceToken?: string,
): Promise<void> {
  if (!deviceToken) return;
  const pool = getPgPool();
  if (pool) await deleteIosDeviceToken(pool, deviceToken, userId);
}

export const nativePushTokenSchema = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{16,}$',
  maxLength: 512,
} as const;

export const nativePush = {
  revoke: revokeNativePushToken,
  schema: nativePushTokenSchema,
};
