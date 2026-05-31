import type { AuthUser } from './types';
import type { NativeAuthTokens } from './nativeBearer';

export type EchoBrowserSessionResult = {
  user: AuthUser;
  csrfToken: string;
  nativeAuth?: NativeAuthTokens;
};

/** JSON body for login/register/refresh responses (includes native bearer tokens when minted). */
export function authSessionJsonBody(result: EchoBrowserSessionResult): {
  user: AuthUser;
  csrfToken: string;
  auth?: NativeAuthTokens;
} {
  return {
    user: result.user,
    csrfToken: result.csrfToken,
    ...(result.nativeAuth ? { auth: result.nativeAuth } : {}),
  };
}
