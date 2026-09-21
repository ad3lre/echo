/**
 * Smoke-tests the Apple MLS bridge bundle in Node with WebCrypto + mocked host.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import nodeCrypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(
  here,
  '../Modules/EchoFeatures/Resources/EchoMlsBridge.js',
);

const storage = new Map();
let groupInfoB64 = null;
const registeredDevices = new Set();

const host = {
  storageGet: (key) => storage.get(key) ?? null,
  storageSet: (key, value) => {
    storage.set(key, value);
  },
  storageRemove: (key) => {
    storage.delete(key);
  },
  async fetch(method, path, _token, body) {
    if (path.includes('/e2ee/devices/register') && method === 'POST') {
      const parsed = JSON.parse(body || '{}');
      if (parsed.deviceId) registeredDevices.add(parsed.deviceId);
      return { status: 204, bodyText: '' };
    }
    if (path.includes('/e2ee/devices') && method === 'GET') {
      return {
        status: 200,
        bodyText: JSON.stringify({
          devices: [...registeredDevices].map((deviceId, i) => ({
            deviceId,
            protocolDeviceId: i + 1,
            createdAt: new Date().toISOString(),
            revokedAt: null,
          })),
        }),
      };
    }
    if (path.includes('/group-info') && method === 'GET') {
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          groupId: groupInfoB64 ? 'g1' : null,
          currentEpoch: groupInfoB64 ? '0' : null,
          groupInfo: groupInfoB64,
        }),
      };
    }
    if (path.includes('/init') && method === 'POST') {
      groupInfoB64 = JSON.parse(body).groupInfo;
      return {
        status: 200,
        bodyText: JSON.stringify({
          created: true,
          groupId: 'g1',
          currentEpoch: '0',
        }),
      };
    }
    if (path.includes('/messages')) {
      return { status: 200, bodyText: JSON.stringify({ messages: [] }) };
    }
    if (path.includes('/leave') || path.includes('/commit')) {
      return {
        status: 200,
        bodyText: JSON.stringify({ seq: '1', epoch: '1' }),
      };
    }
    return {
      status: 404,
      bodyText: JSON.stringify({ code: 'NOT_FOUND', message: path }),
    };
  },
};

const context = {
  console,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  DataView,
  Promise,
  setTimeout,
  clearTimeout,
  Map,
  Set,
  JSON,
  Error,
  TypeError,
  Math,
  Date,
  crypto: nodeCrypto.webcrypto,
};
context.globalThis = context;
context.__echoMlsHost = host;
vm.createContext(context);
vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), context);

assert.equal(typeof context.__echoMlsPrepareDm, 'function');
assert.equal(typeof context.__echoMlsSync, 'function');
assert.equal(typeof context.__echoMlsStop, 'function');

const resultJson = await new Promise((resolve, reject) => {
  context.__echoMlsPrepareDm(
    JSON.stringify({
      channelId: 'dm-probe',
      token: 'tok',
      viewerUserId: 'user-a',
      authorizedUserIds: ['user-a'],
    }),
    (err, json) => {
      if (err) reject(new Error(err));
      else resolve(json);
    },
  );
});

const result = JSON.parse(resultJson);
assert.equal(typeof result.keyIndex, 'number');
assert.ok(result.deviceId);
assert.ok(result.senderKeys['user-a']);
assert.equal(Buffer.from(result.senderKeys['user-a'], 'base64').length, 16);
assert.ok(groupInfoB64, 'init should publish group info');
assert.ok(registeredDevices.has(result.deviceId), 'device should register');

const syncJson = await new Promise((resolve, reject) => {
  context.__echoMlsSync((err, json) => {
    if (err) reject(new Error(err));
    else resolve(json);
  });
});
assert.equal(JSON.parse(syncJson), null);

await new Promise((resolve, reject) => {
  context.__echoMlsStop((err, json) => {
    if (err) reject(new Error(err));
    else resolve(json);
  });
});

console.log('apple mls bridge prepare ok', {
  keyIndex: result.keyIndex,
  deviceId: result.deviceId,
  senderKeyBytes: Buffer.from(result.senderKeys['user-a'], 'base64').length,
});
