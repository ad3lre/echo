import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';

function setEnv(next: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(next)) {
    prev[k] = process.env[k];
    const v = next[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of Object.keys(next)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

function clearModule(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require.resolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
}

function clearRequireCacheBySubstring(substrings: string[]) {
  for (const k of Object.keys(require.cache)) {
    if (substrings.some((s) => k.includes(s))) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

function clearConfigAndRoutes() {
  clearModule('../config');
  clearRequireCacheBySubstring([
    `${path.sep}backend${path.sep}src${path.sep}config.`,
    `${path.sep}backend${path.sep}src${path.sep}bootstrap${path.sep}createFastify.`,
    `${path.sep}backend${path.sep}src${path.sep}bootstrap${path.sep}httpPlugins.`,
    `${path.sep}backend${path.sep}src${path.sep}net${path.sep}clientIp.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}mediaUrlPolicy.`,
    `${path.sep}backend${path.sep}src${path.sep}sockets${path.sep}messageValidation.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}storedMediaUrl.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}s3UploadPresign.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}discordImportAuthorization.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}linkUnfurl${path.sep}linkUnfurlFetch.`,
    `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}health.`,
    `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}giphy.`,
    `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}serperImageSearch.`,
    `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}echo${path.sep}echoInvites.`,
  ]);
}

function repoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function isTrackedRuntimeEnvFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  const name = normalized.split('/').pop() ?? '';
  return (
    name === '.env' || (name.startsWith('.env.') && name !== '.env.example')
  );
}

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  {
    const trackedEnvFiles = execFileSync('git', ['ls-files'], {
      cwd: repoRoot(),
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(isTrackedRuntimeEnvFile);
    assert.deepEqual(
      trackedEnvFiles,
      [],
      `runtime env files must not be tracked: ${trackedEnvFiles.join(', ')}`,
    );
  }

  const httpRestore = setEnv({
    NODE_ENV: 'test',
    ECHO_METRICS_SCRAPE_TOKEN: 'test-scrape-token',
    ECHO_HEALTH_REDACT: 'true',
    ECHO_BACKEND_STORAGE: 'memory',
    ECHO_DISCORD_BOT_WEBHOOK_SECRET: 'test-discord-bot-secret',
    DATABASE_URL: '',
    USE_MOCK_DB: 'true',
  });
  try {
    process.env.DATABASE_URL = '';
    process.env.USE_MOCK_DB = 'true';
    clearConfigAndRoutes();

    const { default: healthRoutes } = await import('../api/routes/health');
    const healthApp = Fastify({ logger: false });
    await healthApp.register(healthRoutes, { prefix: '/api/v1' });

    let res = await healthApp.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });
    assert.equal(res.statusCode, 401);

    res = await healthApp.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: 'Bearer test-scrape-token' },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.length > 0);

    res = await healthApp.inject({ method: 'GET', url: '/api/v1/health' });
    assert.equal(res.statusCode, 200);
    const hj = JSON.parse(res.body) as Record<string, unknown>;
    assert.equal(hj.status, 'ok');
    assert.equal('backendStorageMode' in hj, false);
    assert.equal('useMockDb' in hj, false);
    assert.equal('db' in hj, false);
    assert.equal('nats' in hj, false);

    await healthApp.close();

    clearConfigAndRoutes();
    const { default: giphyRoutes } = await import('../api/routes/giphy');
    const giphyApp = Fastify({ logger: false });
    await giphyApp.register(giphyRoutes, { prefix: '/api/v1' });
    let giphyLast = 0;
    for (let i = 0; i < 25; i++) {
      const r = await giphyApp.inject({
        method: 'GET',
        url: '/api/v1/giphy/trending',
      });
      giphyLast = r.statusCode;
    }
    assert.equal(giphyLast, 429);
    await giphyApp.close();

    clearConfigAndRoutes();
    process.env.SERPER_API_KEY = 'test-serper-key-for-rate-limit';
    const { default: serperImageSearchRoutes } =
      await import('../api/routes/serperImageSearch');
    const imageSearchApp = Fastify({ logger: false });
    await imageSearchApp.register(serperImageSearchRoutes, {
      prefix: '/api/v1',
    });
    let imageSearchLast = 0;
    for (let i = 0; i < 25; i++) {
      const r = await imageSearchApp.inject({
        method: 'GET',
        url: '/api/v1/image-search',
      });
      imageSearchLast = r.statusCode;
    }
    assert.equal(imageSearchLast, 429);
    await imageSearchApp.close();

    clearConfigAndRoutes();
    const { default: echoInvitesRoutes } =
      await import('../api/routes/echo/echoInvites');
    const inviteApp = Fastify({ logger: false });
    await inviteApp.register(echoInvitesRoutes, { prefix: '/api/v1/echo' });
    let inviteLast = 0;
    for (let i = 0; i < 65; i++) {
      const r = await inviteApp.inject({
        method: 'GET',
        url: '/api/v1/echo/invites/nope/preview',
      });
      inviteLast = r.statusCode;
    }
    assert.equal(inviteLast, 429);
    await inviteApp.close();

    clearConfigAndRoutes();
    const { clientIpFromFastifyRequest, clientIpFromSocketHandshake } =
      await import('../net/clientIp');
    assert.equal(
      clientIpFromFastifyRequest({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      } as any),
      '127.0.0.1',
    );
    assert.equal(
      clientIpFromSocketHandshake(
        { 'x-forwarded-for': '203.0.113.10' },
        '127.0.0.1',
        false,
      ),
      '127.0.0.1',
    );
    assert.equal(
      clientIpFromSocketHandshake(
        { 'x-forwarded-for': '203.0.113.10, 198.51.100.20' },
        '127.0.0.1',
        true,
      ),
      '203.0.113.10',
    );

    const untrustedProxyRestore = setEnv({
      NODE_ENV: 'test',
      ENFORCE_HTTPS: 'true',
      ECHO_TRUST_PROXY: undefined,
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    let httpsRes = null as Awaited<
      ReturnType<ReturnType<typeof Fastify>['inject']>
    > | null;
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { createFastifyServer } =
        await import('../bootstrap/createFastify');
      const { registerHttpsEnforcementIfConfigured } =
        await import('../bootstrap/httpPlugins');
      const httpsApp = createFastifyServer();
      registerHttpsEnforcementIfConfigured(httpsApp);
      httpsApp.get('/probe', async () => ({ ok: true }));

      httpsRes = await httpsApp.inject({
        method: 'GET',
        url: '/probe',
        headers: { 'x-forwarded-proto': 'https' },
      });
      assert.equal(httpsRes.statusCode, 426);
      await httpsApp.close();
    } finally {
      untrustedProxyRestore();
      clearConfigAndRoutes();
    }

    const trustedProxyRestore = setEnv({
      NODE_ENV: 'test',
      ENFORCE_HTTPS: 'true',
      ECHO_TRUST_PROXY: 'true',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { createFastifyServer: createTrustedFastifyServer } =
        await import('../bootstrap/createFastify');
      const {
        registerHttpsEnforcementIfConfigured: registerTrustedHttpsEnforcement,
      } = await import('../bootstrap/httpPlugins');
      const trustedHttpsApp = createTrustedFastifyServer();
      registerTrustedHttpsEnforcement(trustedHttpsApp);
      trustedHttpsApp.get('/probe', async () => ({ ok: true }));
      httpsRes = await trustedHttpsApp.inject({
        method: 'GET',
        url: '/probe',
        headers: { 'x-forwarded-proto': 'https' },
      });
      assert.equal(httpsRes.statusCode, 200);
      await trustedHttpsApp.close();
    } finally {
      trustedProxyRestore();
      clearConfigAndRoutes();
    }

    clearConfigAndRoutes();
    const { default: discordBotHookRoutes } =
      await import('../api/routes/discordBotHook');
    const { default: discordBridgeHookRoutes } =
      await import('../api/routes/discordBridgeHook');
    const { default: discordVoiceMirrorHookRoutes } =
      await import('../api/routes/discordVoiceMirrorHook');
    const hooksApp = Fastify({ logger: false });
    await hooksApp.register(discordBotHookRoutes);
    await hooksApp.register(discordBridgeHookRoutes);
    await hooksApp.register(discordVoiceMirrorHookRoutes);

    let hookRes = await hooksApp.inject({
      method: 'GET',
      url: '/hooks/discord-bot/export-pending',
    });
    assert.equal(hookRes.statusCode, 401);

    hookRes = await hooksApp.inject({
      method: 'GET',
      url: '/hooks/discord-bot/export-pending',
      headers: { 'x-echo-discord-bot-secret': 'x' },
    });
    assert.equal(hookRes.statusCode, 401);

    hookRes = await hooksApp.inject({
      method: 'GET',
      url: '/hooks/discord-bot/export-pending',
      headers: { 'x-echo-discord-bot-secret': 'test-discord-bot-secret' },
    });
    assert.equal(hookRes.statusCode, 503);

    hookRes = await hooksApp.inject({
      method: 'GET',
      url: '/hooks/discord-bridge/allowlist',
      headers: { 'x-echo-discord-bot-secret': 'test-discord-bot-secret' },
    });
    assert.equal(hookRes.statusCode, 503);

    hookRes = await hooksApp.inject({
      method: 'GET',
      url: '/hooks/discord-voice-mirror/watchlist',
      headers: { 'x-echo-discord-bot-secret': 'test-discord-bot-secret' },
    });
    assert.equal(hookRes.statusCode, 503);

    await hooksApp.close();
  } finally {
    httpRestore();
    clearConfigAndRoutes();
  }

  {
    const botHookSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'discordBotHook.ts',
      ),
      'utf8',
    );
    assert.match(
      botHookSource,
      /x-echo-delivery-id/,
      'discord bot webhook must require delivery-id header',
    );
    assert.match(
      botHookSource,
      /consumeWebhookDeliveryOnce/,
      'discord bot webhook must enforce replay protection',
    );
    const bridgeHookSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'discordBridgeHook.ts',
      ),
      'utf8',
    );
    assert.match(
      bridgeHookSource,
      /x-echo-delivery-id/,
      'discord bridge webhook must require delivery-id header',
    );
    assert.match(
      bridgeHookSource,
      /consumeWebhookDeliveryOnce/,
      'discord bridge webhook must enforce replay protection',
    );
    const voiceMirrorHookSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'discordVoiceMirrorHook.ts',
      ),
      'utf8',
    );
    assert.match(
      voiceMirrorHookSource,
      /x-echo-delivery-id/,
      'discord voice mirror webhook must require delivery-id header',
    );
    assert.match(
      voiceMirrorHookSource,
      /consumeWebhookDeliveryOnce/,
      'discord voice mirror webhook must enforce replay protection',
    );
    const botEchoApiSource = await readFile(
      path.join(process.cwd(), 'bot', 'src', 'echoApi.ts'),
      'utf8',
    );
    assert.match(
      botEchoApiSource,
      /x-echo-signature/,
      'discord bot echoApi must sign production webhook POSTs',
    );
    assert.match(
      botEchoApiSource,
      /x-echo-delivery-id/,
      'discord bot echoApi must send delivery-id on POSTs',
    );
    const meDiscordSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'meDiscord.ts',
      ),
      'utf8',
    );
    const exportPendingBlockStart = meDiscordSource.indexOf(
      "'/me/discord/bot-export-pending'",
    );
    assert.ok(
      exportPendingBlockStart >= 0,
      'discord bot export pending route must exist',
    );
    const exportPendingBlock = meDiscordSource.slice(
      exportPendingBlockStart,
      exportPendingBlockStart + 3500,
    );
    assert.match(
      exportPendingBlock,
      /requireDiscordImportableGuildForUser/,
      'discord bot export pending must authorize the requested guild server-side',
    );
    assert.match(
      exportPendingBlock,
      /authorizedGuild\.name/,
      'discord bot export pending must use the Discord API guild name, not client input',
    );

    const bridgeSettingsSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'echo',
        'echoDiscordBridgeSettings.ts',
      ),
      'utf8',
    );
    assert.match(
      bridgeSettingsSource,
      /getDiscordBridgeForEchoChannelInServer/,
      'discord bridge settings reads must be scoped to the requested server',
    );
    assert.match(
      bridgeSettingsSource,
      /discord-bridge\/bulk-apply/,
      'discord bridge category bulk sync route must exist',
    );
    assert.doesNotMatch(
      bridgeSettingsSource,
      /getDiscordBridgeForEchoChannel\(pool,\s*channelId\)/,
      'discord bridge settings must not read bridge metadata before server/channel ownership is proven',
    );

    const bridgeRepoSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'domain',
        'discordBridgeRepo.ts',
      ),
      'utf8',
    );
    assert.match(
      bridgeRepoSource,
      /pg_advisory_xact_lock/,
      'discord bridge upserts must serialize per Discord channel pair',
    );
    assert.match(
      bridgeRepoSource,
      /findActiveDiscordBridgeConflict/,
      'discord bridge upserts must check active pair conflicts in the domain layer',
    );
    assert.match(
      bridgeRepoSource,
      /AND inbound_enabled = true/,
      'discord bridge inbound resolution must ignore disabled duplicate bridge rows',
    );

    const echoTablesSource = await readFile(
      path.join(process.cwd(), 'backend', 'src', 'db', 'echoTables.ts'),
      'utf8',
    );
    assert.match(
      echoTablesSource,
      /echo_discord_channel_bridges_active_pair_unique/,
      'discord bridge active Discord channel pairs must be database-unique',
    );
    assert.match(
      echoTablesSource,
      /echo_discord_channel_bridges_active_pair_required/,
      'discord bridge active rows must require Discord guild/channel ids in the database',
    );
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const {
        DiscordImportAuthorizationError,
        findImportableDiscordGuild,
        requireDiscordImportableGuildForUser,
      } = await import('../services/discordImportAuthorization');
      const managedGuild = {
        id: '123456789012345678',
        name: 'Managed',
        icon: null,
        owner: false,
        permissions: String(1 << 5),
      };
      const memberOnlyGuild = {
        ...managedGuild,
        id: '223456789012345678',
        name: 'Member only',
        permissions: '0',
      };
      assert.equal(
        findImportableDiscordGuild([managedGuild], managedGuild.id)?.name,
        'Managed',
      );
      assert.equal(
        findImportableDiscordGuild([memberOnlyGuild], memberOnlyGuild.id),
        null,
      );

      const pool = {} as any;
      const authorized = await requireDiscordImportableGuildForUser(
        pool,
        'user_1',
        managedGuild.id,
        {
          getDiscordUserAccessTokenForApi: async () => 'access-token',
          fetchDiscordUserGuildsAll: async (token) => {
            assert.equal(token, 'access-token');
            return [memberOnlyGuild, managedGuild];
          },
        },
      );
      assert.equal(authorized.name, 'Managed');

      await assert.rejects(
        () =>
          requireDiscordImportableGuildForUser(
            pool,
            'user_1',
            memberOnlyGuild.id,
            {
              getDiscordUserAccessTokenForApi: async () => 'access-token',
              fetchDiscordUserGuildsAll: async () => [memberOnlyGuild],
            },
          ),
        (err) =>
          err instanceof DiscordImportAuthorizationError &&
          err.statusCode === 403 &&
          err.errorCode === 'FORBIDDEN',
      );

      let fetchedAfterExpiredToken = false;
      await assert.rejects(
        () =>
          requireDiscordImportableGuildForUser(
            pool,
            'user_1',
            managedGuild.id,
            {
              getDiscordUserAccessTokenForApi: async () => {
                throw new Error('TOKEN_EXPIRED');
              },
              fetchDiscordUserGuildsAll: async () => {
                fetchedAfterExpiredToken = true;
                return [managedGuild];
              },
            },
          ),
        (err) =>
          err instanceof DiscordImportAuthorizationError &&
          err.statusCode === 401 &&
          err.errorCode === 'DISCORD_TOKEN_EXPIRED',
      );
      assert.equal(fetchedAfterExpiredToken, false);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { isUrlSafeForOutboundFetch } =
        await import('../services/linkUnfurl/linkUnfurlFetch');
      assert.equal(isUrlSafeForOutboundFetch('http://[::1]/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://[fd00::1]/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://[fe80::1]/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://100.64.0.1/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://198.18.0.1/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://203.0.113.7/'), false);
      assert.equal(isUrlSafeForOutboundFetch('http://[2001:db8::1]/'), false);
      assert.equal(
        isUrlSafeForOutboundFetch('https://[2606:4700:4700::1111]/'),
        true,
      );
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const routeSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'echo',
        'echoDiscordImport.ts',
      ),
      'utf8',
    );
    const bindBlockStart = routeSource.indexOf(
      "'/servers/:serverId/discord-import/bind'",
    );
    assert.ok(bindBlockStart >= 0, 'discord-import bind route must exist');
    const bindBlock = routeSource.slice(bindBlockStart, bindBlockStart + 3500);
    assert.match(
      bindBlock,
      /canManageServer/,
      'discord-import bind must require manage-server capability',
    );
  }

  {
    const routeSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'echo',
        'echoDiscordImport.ts',
      ),
      'utf8',
    );
    const refreshStart = routeSource.indexOf(
      "'/servers/:serverId/discord-import/refresh-from-export'",
    );
    assert.ok(
      refreshStart >= 0,
      'discord-import refresh-from-export route must exist',
    );
    const refreshBlock = routeSource.slice(refreshStart, refreshStart + 2800);
    assert.match(
      refreshBlock,
      /canManageServer/,
      'discord-import refresh-from-export must require manage-server capability',
    );
  }

  {
    const rolesRouteSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'echo',
        'echoRoles.ts',
      ),
      'utf8',
    );
    const bootstrapBlockStart = rolesRouteSource.indexOf(
      "'/servers/:serverId/role-ui-bootstrap'",
    );
    assert.ok(bootstrapBlockStart >= 0, 'role-ui-bootstrap route must exist');
    const bootstrapBlock = rolesRouteSource.slice(
      bootstrapBlockStart,
      bootstrapBlockStart + 4500,
    );
    assert.match(
      bootstrapBlock,
      /capabilities\.canManageRoles\s*\|\|\s*capabilities\.canManageServer/,
      'role-ui-bootstrap must gate global role graph data behind manage-roles or manage-server',
    );
    assert.match(
      bootstrapBlock,
      /withoutEchoAuthorityAssignments\(assignmentsRaw,\s*authIds\)/,
      'role-ui-bootstrap must strip authority assignments for users without manage-roles',
    );
  }

  {
    const uploadsRouteSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'echo',
        'echoUploads.ts',
      ),
      'utf8',
    );
    assert.match(
      uploadsRouteSource,
      /storageKeyPrefix:\s*dedupeScopePrefixFromStorageKey\(destProbe\.storageKey\)/,
      'dedupe match must be scoped to upload destination prefix',
    );
    assert.match(
      uploadsRouteSource,
      /UPLOAD_TOKEN_REPLAYED/,
      'local upload route must reject replayed one-time upload tokens',
    );
    assert.match(
      uploadsRouteSource,
      /consumeLocalUploadTokenOnce\(/,
      'local upload route must consume upload tokens with one-time semantics',
    );

    const chatMessageHandlerSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'sockets',
        'chatMessageHandler.ts',
      ),
      'utf8',
    );
    assert.match(
      chatMessageHandlerSource,
      /clientIpFromSocketHandshake\(/,
      'socket message abuse limiter must resolve client IP via trustProxy-aware helper',
    );

    const channelHandlersSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'sockets',
        'channelHandlers.ts',
      ),
      'utf8',
    );
    assert.match(
      channelHandlersSource,
      /if \(!authenticated \|\| isAnonymousSocketUser\(userId\)\)/,
      'joinChannel must require authenticated non-anonymous identity before store checks',
    );
    assert.match(
      channelHandlersSource,
      /if \(!pool\)[\s\S]*'UNAVAILABLE'/,
      'joinChannel must fail closed when Echo pool is unavailable (no arbitrary room join)',
    );
    assert.match(
      channelHandlersSource,
      /revalidateRecoveredChannelRooms/,
      'socket recovery must re-check channel room membership after connectionStateRecovery',
    );
    assert.match(
      channelHandlersSource,
      /emitJoinChannelError\([\s\S]*'FORBIDDEN'/,
      'joinChannel must emit structured FORBIDDEN errors instead of silent deny',
    );

    const middlewareSource = await readFile(
      path.join(process.cwd(), 'backend', 'src', 'auth', 'middleware.ts'),
      'utf8',
    );
    assert.doesNotMatch(
      middlewareSource,
      /sess\.cachedUser\s*\?\?/,
      'requireAuth must load user from auth store on each request (no cachedUser authorization shortcut)',
    );
    assert.match(
      middlewareSource,
      /store\.getUserById\(sess\.userId\)/,
      'requireAuth must load user from auth store on each request',
    );

    const localUploadDiskSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'services',
        'localUploadDisk.ts',
      ),
      'utf8',
    );
    assert.match(
      localUploadDiskSource,
      /createWriteStream\(abs,\s*\{\s*flags:\s*'wx'\s*\}\)/,
      'local upload writes must be single-use (no overwrite) to prevent token replay',
    );
  }

  {
    const mailSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'services',
        'email',
        'sendMail.ts',
      ),
      'utf8',
    );
    assert.doesNotMatch(
      mailSource,
      /preview:\s*mail\.text\.slice/,
      'email fallback logging must not include token-bearing body previews',
    );

    const smsSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'services',
        'sms',
        'sendSms.ts',
      ),
      'utf8',
    );
    assert.doesNotMatch(
      smsSource,
      /preview:\s*sms\.body\.slice/,
      'sms fallback logging must not include OTP-bearing body previews',
    );
  }

  {
    const sessionRouteSource = await readFile(
      path.join(
        process.cwd(),
        'backend',
        'src',
        'api',
        'routes',
        'auth',
        'session.ts',
      ),
      'utf8',
    );
    assert.match(
      sessionRouteSource,
      /rotateRefreshTokenAtomic/,
      'refresh route must use atomic rotate operation to prevent race double-mint',
    );

    const middlewareSource = await readFile(
      path.join(process.cwd(), 'backend', 'src', 'auth', 'middleware.ts'),
      'utf8',
    );
    assert.match(
      middlewareSource,
      /findRefreshTokenById\(sess\.refreshTokenId\)/,
      'requireAuth must verify session-bound refresh token remains active',
    );
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_MEDIA_URL_REQUIRE_HTTPS: 'true',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { validateMessagePayload } =
        await import('../sockets/messageValidation');
      const v = validateMessagePayload({
        channelId: 'ch1',
        content: 'x',
        messageFormatVersion: 1,
        contentSchemaVersion: 1,
        attachments: [
          {
            url: 'http://insecure.example/x.png',
            kind: 'image',
          },
        ],
      });
      assert.equal(v.ok, false);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_MEDIA_URL_REQUIRE_HTTPS: 'true',
      ECHO_MEDIA_URL_ALLOWED_HOSTS: '',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { validateMessagePayload } =
        await import('../sockets/messageValidation');
      const arbitraryHost = validateMessagePayload({
        channelId: 'ch1',
        content: 'x',
        messageFormatVersion: 1,
        contentSchemaVersion: 1,
        attachments: [
          {
            url: 'https://example.invalid/x.png',
            kind: 'image',
          },
        ],
      });
      assert.equal(arbitraryHost.ok, false);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_MEDIA_URL_ALLOWED_HOSTS: 'cdn.example.com',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { validateMessagePayload } =
        await import('../sockets/messageValidation');
      const bad = validateMessagePayload({
        channelId: 'ch1',
        content: 'x',
        messageFormatVersion: 1,
        contentSchemaVersion: 1,
        attachments: [
          {
            url: 'https://evil.com/x.png',
            kind: 'image',
          },
        ],
      });
      assert.equal(bad.ok, false);

      const good = validateMessagePayload({
        channelId: 'ch1',
        content: 'x',
        messageFormatVersion: 1,
        contentSchemaVersion: 1,
        attachments: [
          {
            url: 'https://cdn.example.com/x.png',
            kind: 'image',
          },
        ],
      });
      assert.equal(good.ok, true);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_MEDIA_URL_ALLOWED_HOSTS: 'cdn.example.com',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { validateEchoStoredBrandingUrl } =
        await import('../services/storedMediaUrl');
      const ok = validateEchoStoredBrandingUrl(
        'https://cdn.example.com/z.webp',
      );
      assert.equal(ok.ok, true);
      const bad = validateEchoStoredBrandingUrl('https://other.com/z.webp');
      assert.equal(bad.ok, false);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
      ECHO_S3_BUCKET: 'echo-uploads',
      ECHO_S3_REGION: 'us-east-1',
      ECHO_S3_ACCESS_KEY: 'test',
      ECHO_S3_SECRET_KEY: 'test',
      ECHO_S3_ENDPOINT: 'http://127.0.0.1:9000',
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { validateEchoStoredBrandingUrl } =
        await import('../services/storedMediaUrl');
      const minioStyle = validateEchoStoredBrandingUrl(
        'http://127.0.0.1:9000/echo-uploads/echo/avatars/u1/face.png',
      );
      assert.equal(minioStyle.ok, true);
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  {
    const restore = setEnv({
      NODE_ENV: 'test',
      ECHO_BACKEND_STORAGE: 'memory',
      DATABASE_URL: '',
      USE_MOCK_DB: 'true',
      ECHO_LOCAL_UPLOAD_DIR: path.join(
        process.cwd(),
        'tmp',
        'ship-test-uploads',
      ),
      ECHO_S3_BUCKET: undefined,
      ECHO_S3_REGION: undefined,
      ECHO_S3_ACCESS_KEY: undefined,
      ECHO_S3_SECRET_KEY: undefined,
      ECHO_S3_ENDPOINT: undefined,
    });
    try {
      process.env.DATABASE_URL = '';
      process.env.USE_MOCK_DB = 'true';
      clearConfigAndRoutes();
      const { buildEchoUploadPublicUrlForStorageKey } =
        await import('../services/s3UploadPresign');
      assert.equal(
        buildEchoUploadPublicUrlForStorageKey('echo/channels/a/file.png'),
        '/api/v1/echo/uploads/files/echo/channels/a/file.png',
      );
    } finally {
      restore();
      clearConfigAndRoutes();
    }
  }

  console.log('shippingSecurity: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
