import assert from 'node:assert/strict';
import type { AuthStore } from '../auth/store';
import type { AuthUser } from '../auth/types';
import { applyDiscordProfileMerge } from '../domain/discordProfileMerge';
import { mapDiscordUserToNormalized } from '../domain/discordNormalized';

async function run(): Promise<void> {
  const patches: { userId: string; patch: Record<string, unknown> }[] = [];

  const store: Pick<AuthStore, 'updateUserProfile' | 'getUserById'> = {
    async getUserById() {
      return null;
    },
    async updateUserProfile(userId, patch) {
      patches.push({ userId, patch: patch as Record<string, unknown> });
      return null;
    },
  };

  const guest: AuthUser = {
    id: 'g1',
    username: 'guest_x',
    displayName: '',
    pfp: '',
    status: 'online',
    createdAt: new Date().toISOString(),
    emailVerified: false,
    phoneVerified: false,
    isGuest: true,
  };

  const me = {
    id: 'd1',
    username: 'disc',
    global_name: 'Discord Name',
    avatar: 'hash',
    email: 'x@y.z',
    verified: true,
  };
  const normalized = mapDiscordUserToNormalized(me);

  const kind = await applyDiscordProfileMerge({
    store: store as AuthStore,
    user: guest,
    me,
    normalized,
  });
  assert.equal(kind, 'full');
  assert.ok(patches.some((p) => p.patch.displayName === 'Discord Name'));
  const pfpPatch = patches.find((p) => p.patch.pfp !== undefined);
  if (pfpPatch && typeof pfpPatch.patch.pfp === 'string') {
    assert.ok(
      !String(pfpPatch.patch.pfp).includes('cdn.discordapp.com'),
      'Discord OAuth merge must not persist CDN avatar URLs',
    );
  }
  assert.ok(
    patches.every((p) => p.patch.email === undefined),
    'Discord OAuth merge must not call updateUserProfile({ email }) — that throws EMAIL_CHANGE_REQUIRES_VERIFICATION and aborts linking',
  );

  patches.length = 0;
  const registered: AuthUser = {
    ...guest,
    isGuest: false,
    email: 'reg@test.dev',
  };
  const kind2 = await applyDiscordProfileMerge({
    store: store as AuthStore,
    user: registered,
    me,
    normalized,
  });
  assert.equal(kind2, 'partial');
  assert.equal(patches.length, 0);

  // Long Discord global names must not exceed Echo display cap (merge_failed otherwise).
  patches.length = 0;
  const meLong = {
    ...me,
    global_name: 'a'.repeat(70),
    username: 'shortuser',
  };
  const normalizedLong = mapDiscordUserToNormalized(meLong);
  const kindLong = await applyDiscordProfileMerge({
    store: store as AuthStore,
    user: guest,
    me: meLong,
    normalized: normalizedLong,
  });
  assert.equal(kindLong, 'full');
  const dn = patches.find((p) => p.patch.displayName !== undefined);
  assert.ok(dn);
  assert.equal(String(dn!.patch.displayName).length, 64);

  // Email on the Discord profile must not reach updateUserProfile (verification gate).
  patches.length = 0;
  const storeRejectEmail: Pick<AuthStore, 'updateUserProfile' | 'getUserById'> =
    {
      async getUserById() {
        return null;
      },
      async updateUserProfile(userId, patch) {
        if (patch.email !== undefined) {
          throw new Error('EMAIL_CHANGE_REQUIRES_VERIFICATION');
        }
        patches.push({ userId, patch: patch as Record<string, unknown> });
        return null;
      },
    };
  const kindSkip = await applyDiscordProfileMerge({
    store: storeRejectEmail as AuthStore,
    user: guest,
    me,
    normalized,
  });
  assert.equal(kindSkip, 'full');
  assert.ok(
    patches.some((p) => p.patch.displayName === 'Discord Name'),
    'display import should succeed without writing email via updateUserProfile',
  );
}

void run()
  .then(() => {
    console.log('discordProfileMerge.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
