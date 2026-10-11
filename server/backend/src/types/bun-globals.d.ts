/** Minimal Bun globals used by Echo backend (runtime is Bun). */
interface BunPassword {
  hash(
    password: string,
    options: { algorithm: 'bcrypt'; cost: number },
  ): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

declare var Bun: {
  password: BunPassword;
};
