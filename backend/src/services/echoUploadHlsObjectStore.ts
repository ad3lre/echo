import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
} from './s3UploadPresign';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import { resolveLocalUploadFilePath } from './localUploadDisk';

function contentTypeForHlsObjectKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.endsWith('.m4s')) return 'video/iso.segment';
  if (lower.includes('/hls/') && lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

/**
 * Segments/init files are content (named per pack) → cache immutable for a year.
 * Manifests (`.m3u8`) live at a **stable, non-versioned** path (`.../hls/master.m3u8`) and
 * are rewritten in place when a source changes and the pack is republished, so they must
 * NOT be cached immutably or a CDN/browser will serve a stale playlist. Short max-age with
 * revalidation keeps the entry point fresh while still allowing edge caching.
 */
function cacheControlForHlsObjectKey(key: string): string {
  if (key.toLowerCase().endsWith('.m3u8')) {
    return 'public, max-age=60, must-revalidate';
  }
  return 'public, max-age=31536000, immutable';
}

async function writeS3BodyToFile(
  body: unknown,
  destPath: string,
): Promise<void> {
  if (!body || typeof body !== 'object' || !('pipe' in body)) {
    throw new Error('invalid S3 object stream');
  }
  await pipeline(
    body as NodeJS.ReadableStream,
    createWriteStream(destPath, { flags: 'w' }),
  );
}

export async function downloadEchoUploadObjectToFile(
  storageKey: string,
  destPath: string,
): Promise<void> {
  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) throw new Error('S3 not configured');
    const obj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    await writeS3BodyToFile(obj.Body, destPath);
    return;
  }
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) throw new Error('invalid local storage key');
  await copyFile(abs, destPath);
}

export async function uploadLocalFileToEchoUploadKey(
  localPath: string,
  storageKey: string,
): Promise<void> {
  const ct = contentTypeForHlsObjectKey(storageKey);
  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) throw new Error('S3 not configured');
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: createReadStream(localPath),
        ContentType: ct,
        CacheControl: cacheControlForHlsObjectKey(storageKey),
      }),
    );
    return;
  }
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) throw new Error('invalid local storage key');
  await mkdir(path.dirname(abs), { recursive: true });
  await copyFile(localPath, abs);
}

async function listS3KeysWithPrefix(prefix: string): Promise<string[]> {
  const client = createEchoS3UploadClient();
  const bucket = getEchoS3UploadBucket();
  if (!client || !bucket) return [];
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function listLocalKeysWithPrefix(prefix: string): Promise<string[]> {
  const packDir = resolveLocalUploadFilePath(prefix.replace(/\/$/, ''));
  if (!packDir) return [];
  const keys: string[] = [];
  const walkPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

  async function walk(dir: string, keyPrefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const childAbs = path.join(dir, ent.name);
      const childKey = `${keyPrefix}${ent.name}`;
      if (ent.isDirectory()) {
        await walk(childAbs, `${childKey}/`);
      } else {
        keys.push(childKey);
      }
    }
  }

  await walk(packDir, walkPrefix);
  return keys;
}

export async function listEchoUploadKeysWithPrefix(
  prefix: string,
): Promise<string[]> {
  if (echoUploadPrefersS3ObjectStore(prefix)) {
    return listS3KeysWithPrefix(prefix);
  }
  return listLocalKeysWithPrefix(prefix);
}

export async function deleteEchoUploadKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (echoUploadPrefersS3ObjectStore(keys[0]!)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return;
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
    }
    return;
  }
  for (const key of keys) {
    const abs = resolveLocalUploadFilePath(key);
    if (!abs) continue;
    await rm(abs, { force: true }).catch(() => {});
  }
}

export async function deleteEchoUploadPrefix(prefix: string): Promise<void> {
  const keys = await listEchoUploadKeysWithPrefix(prefix);
  await deleteEchoUploadKeys(keys);
}

export async function uploadLocalDirectoryToEchoUploadPrefix(
  localDir: string,
  storagePrefix: string,
): Promise<string[]> {
  const uploaded: string[] = [];
  const entries = await readdir(localDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const localPath = path.join(localDir, ent.name);
    const key = `${storagePrefix}${ent.name}`;
    await uploadLocalFileToEchoUploadKey(localPath, key);
    uploaded.push(key);
  }
  return uploaded;
}

export async function publishEchoHlsStagingToPackPrefix(opts: {
  stagingPrefix: string;
  packPrefix: string;
  localStagingDir: string;
}): Promise<void> {
  const { stagingPrefix, packPrefix, localStagingDir } = opts;
  const entries = (await readdir(localStagingDir, { withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name);
  const nonMaster = entries.filter((n) => n !== 'master.m3u8').sort();
  const ordered = [
    ...nonMaster,
    ...(entries.includes('master.m3u8') ? ['master.m3u8'] : []),
  ];

  if (echoUploadPrefersS3ObjectStore(packPrefix)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) throw new Error('S3 not configured');
    for (const name of ordered) {
      const srcKey = `${stagingPrefix}${name}`;
      const destKey = `${packPrefix}${name}`;
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${srcKey}`,
          Key: destKey,
          ContentType: contentTypeForHlsObjectKey(destKey),
          CacheControl: cacheControlForHlsObjectKey(destKey),
          MetadataDirective: 'REPLACE',
        }),
      );
    }
    return;
  }

  for (const name of ordered) {
    const srcAbs = path.join(localStagingDir, name);
    const destKey = `${packPrefix}${name}`;
    const destAbs = resolveLocalUploadFilePath(destKey);
    if (!destAbs) throw new Error('invalid pack key');
    await mkdir(path.dirname(destAbs), { recursive: true });
    await copyFile(srcAbs, destAbs);
  }
}

export async function statLocalDirectoryFiles(
  localDir: string,
): Promise<{ name: string; size: number }[]> {
  const out: { name: string; size: number }[] = [];
  const entries = await readdir(localDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const st = await stat(path.join(localDir, ent.name));
    out.push({ name: ent.name, size: st.size });
  }
  return out;
}

export async function deleteEchoUploadObjectKey(
  storageKey: string,
): Promise<void> {
  if (echoUploadPrefersS3ObjectStore(storageKey)) {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }),
    );
    return;
  }
  const abs = resolveLocalUploadFilePath(storageKey);
  if (!abs) return;
  await rm(abs, { force: true }).catch(() => {});
}
