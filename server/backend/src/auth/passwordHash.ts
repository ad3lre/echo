import { config } from '../config';

/**
 * Password hashing via Bun.password (bcrypt). Verifies existing `$2*` hashes
 * produced by the former native `bcrypt` package.
 */
export async function hashPassword(
  password: string,
  cost: number = config.bcryptSaltRounds,
): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
