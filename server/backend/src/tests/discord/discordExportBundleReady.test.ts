import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isDiscordExportBundleReady,
  resolveDiscordExportDirByGuildId,
} from '../../services/discordImport/discordExportBundleReady';

async function run(): Promise<void> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'echo-discord-export-ready-'),
  );
  const guildId = '123456789012345678';
  const bundleDir = path.join(root, `TestGuild_${guildId}`);
  await mkdir(bundleDir, { recursive: true });
  try {
    assert.equal(resolveDiscordExportDirByGuildId(root, guildId), bundleDir);
    assert.equal(await isDiscordExportBundleReady(root, guildId), false);

    await writeFile(path.join(bundleDir, 'guild.json'), '{}');
    await writeFile(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify({ completeness: { echoCoreOk: false } }),
    );
    assert.equal(await isDiscordExportBundleReady(root, guildId), false);

    await writeFile(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify({ completeness: { echoCoreOk: true } }),
    );
    assert.equal(await isDiscordExportBundleReady(root, guildId), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log('discordExportBundleReady: ok');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
