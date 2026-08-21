import type pg from 'pg';
import { requireEchoUploadIntentForRegister } from './echoUploadIntent';
import { verifyEchoStoredUploadObject } from './echoUploadObjectVerify';

export type EchoUploadRegisterResult =
  | { ok: true; declaredByteLength: number; contentType: string }
  | {
      ok: false;
      httpStatus: number;
      code: string;
      message: string;
    };

function mapIntentGateFailure(code: string): EchoUploadRegisterResult {
  switch (code) {
    case 'INTENT_NOT_FOUND':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Upload was not presigned or intent expired',
      };
    case 'INTENT_EXPIRED':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Upload presign intent expired',
      };
    case 'INTENT_OWNER':
      return {
        ok: false,
        httpStatus: 403,
        code: 'FORBIDDEN',
        message: 'Upload intent belongs to another user',
      };
    case 'BYTE_LENGTH_MISMATCH':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'byteLength does not match presigned upload intent',
      };
    case 'CONTENT_TYPE_MISMATCH':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'contentType does not match presigned upload intent',
      };
    default:
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Invalid upload registration',
      };
  }
}

function mapObjectVerifyFailure(reason: string): EchoUploadRegisterResult {
  switch (reason) {
    case 'NOT_FOUND':
      return {
        ok: false,
        httpStatus: 404,
        code: 'NOT_FOUND',
        message: 'Uploaded object not found',
      };
    case 'SIZE_MISMATCH':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Uploaded object size does not match presigned intent',
      };
    case 'TYPE_MISMATCH':
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Uploaded object content type mismatch',
      };
    case 'NOT_CONFIGURED':
      return {
        ok: false,
        httpStatus: 503,
        code: 'UPLOADS_NOT_CONFIGURED',
        message: 'Upload object verification unavailable',
      };
    default:
      return {
        ok: false,
        httpStatus: 400,
        code: 'INVALID_BODY',
        message: 'Invalid upload storage key',
      };
  }
}

/** Gate register/dedupe-register: intent must match presign, object must exist with exact size/type. */
export async function verifyEchoUploadReadyToRegister(
  pool: pg.Pool,
  opts: {
    storageKey: string;
    uploaderId: string;
    contentType: string;
    byteLength: number;
  },
): Promise<EchoUploadRegisterResult> {
  const gate = await requireEchoUploadIntentForRegister(pool, {
    storageKey: opts.storageKey,
    uploaderId: opts.uploaderId,
    clientByteLength: opts.byteLength,
    contentType: opts.contentType,
  });
  if (!gate.ok) {
    return mapIntentGateFailure(gate.code);
  }

  const verified = await verifyEchoStoredUploadObject({
    storageKey: opts.storageKey,
    expectedByteLength: gate.declaredByteLength,
    expectedContentType: gate.contentType,
  });
  if (!verified.ok) {
    return mapObjectVerifyFailure(verified.reason);
  }

  return {
    ok: true,
    declaredByteLength: gate.declaredByteLength,
    contentType: gate.contentType,
  };
}
