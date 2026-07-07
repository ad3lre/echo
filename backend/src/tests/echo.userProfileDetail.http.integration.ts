/**
 * HTTP integration: roster workspace omits bio/banner; GET /users/:id/profile returns them.
 * Run: npm run test:echo:user-profile-detail -w backend
 */
import assert from 'node:assert/strict';
import { getEchoStore } from '../domain/echoStore';
import { buildEchoTestApp } from './helpers/echoTestApp';

type RegisterJson = {
  user?: { id?: string };
};

async function registerUser(
  baseUrl: string,
  label: string,
): Promise<{ userId: string; sid: string }> {
  const username = `${label}_${Date.now().toString(36)}`.slice(0, 32);
  const email = `${username}@profile-detail.echo.test`;
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password: 'password123',
      displayName: label,
    }),
  });
  const bodyText = await res.text();
  assert.equal(res.status, 201, bodyText);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const sidMatch = setCookie.match(/echo_sid=([^;]+)/);
  assert.ok(sidMatch?.[1], 'expected echo_sid cookie');
  const json = JSON.parse(bodyText) as RegisterJson;
  const userId = json.user?.id?.trim() ?? '';
  assert.ok(userId, 'expected user id');
  return { userId, sid: sidMatch[1]! };
}

async function run(): Promise<void> {
  let enabled = false;
  try {
    const s = await getEchoStore();
    enabled = s.enabled;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Postgres is unavailable|pool is unavailable|Check DATABASE_URL/i.test(
        msg,
      )
    ) {
      console.log(
        'echo.userProfileDetail.http: skip (Echo store unavailable)',
        msg,
      );
      return;
    }
    throw e;
  }
  if (!enabled) {
    console.log(
      'echo.userProfileDetail.http: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  try {
    const owner = await registerUser(baseUrl, 'ProfileOwner');
    const peer = await registerUser(baseUrl, 'ProfilePeer');

    const patchRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `echo_sid=${owner.sid}`,
      },
      body: JSON.stringify({
        bio: 'Guild owner bio for lazy-fetch',
        bannerColor: '#223344',
        bannerRefractionEnabled: true,
        bannerBlurEnabled: false,
        bannerBlackoutEnabled: true,
        bannerPositionY: 28,
        timeZone: 'Europe/Berlin',
      }),
    });
    const patchBody = await patchRes.text();
    assert.equal(patchRes.status, 200, patchBody);

    const workspaceRes = await fetch(
      `${baseUrl}/api/v1/echo/workspace?memberDetail=roster`,
      { headers: { cookie: `echo_sid=${peer.sid}` } },
    );
    const workspaceBody = await workspaceRes.text();
    assert.equal(workspaceRes.status, 200, workspaceBody);
    const workspace = JSON.parse(workspaceBody) as {
      membersByServer?: Record<
        string,
        Array<{ userId?: string; bio?: string; bannerImage?: string }>
      >;
    };
    let ownerRoster:
      | { userId?: string; bio?: string; bannerImage?: string }
      | undefined;
    for (const members of Object.values(workspace.membersByServer ?? {})) {
      ownerRoster = members.find((m) => m.userId === owner.userId);
      if (ownerRoster) break;
    }
    assert.ok(ownerRoster, 'peer workspace roster should include owner');
    assert.equal(ownerRoster.bio, undefined);
    assert.equal(ownerRoster.bannerImage, undefined);

    const profileRes = await fetch(
      `${baseUrl}/api/v1/echo/users/${encodeURIComponent(owner.userId)}/profile`,
      { headers: { cookie: `echo_sid=${peer.sid}` } },
    );
    const profileBody = await profileRes.text();
    assert.equal(profileRes.status, 200, profileBody);
    const profile = JSON.parse(profileBody) as {
      id?: string;
      bio?: string;
      bannerImage?: string;
      bannerColor?: string;
      bannerRefractionEnabled?: boolean;
      bannerBlurEnabled?: boolean;
      bannerBlackoutEnabled?: boolean;
      bannerPositionY?: number;
      timeZone?: string | null;
    };
    assert.equal(profile.id, owner.userId);
    assert.equal(profile.bio, 'Guild owner bio for lazy-fetch');
    assert.equal(profile.bannerColor, '#223344');
    assert.equal(profile.bannerRefractionEnabled, true);
    assert.equal(profile.bannerBlurEnabled, false);
    assert.equal(profile.bannerBlackoutEnabled, true);
    assert.equal(profile.bannerPositionY, 28);
    assert.equal(profile.timeZone, 'Europe/Berlin');

    console.log('echo.userProfileDetail.http: ok');
  } finally {
    await close();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
