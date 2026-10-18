import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const outfile = path.resolve(
  here,
  '../Modules/EchoFeatures/Resources/EchoMlsBridge.js',
);
const cryptoRoot = path.resolve(repoRoot, 'server/backend/crypto/src');
const webSrc = path.resolve(repoRoot, 'clients/web/src');

await esbuild.build({
  entryPoints: [path.join(here, 'src/prepare.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  alias: {
    '@/api/echo/transport': path.join(here, 'shims/transport.ts'),
    '@/api/echo/e2ee': path.join(webSrc, 'api/echo/e2ee.ts'),
    '@/features/layout/ids/randomUuid': path.join(
      webSrc,
      'features/layout/ids/randomUuid.ts',
    ),
    '@/services/e2ee/e2eeBase64': path.join(here, 'shims/e2eeBase64.ts'),
    '@/services/e2ee/e2eeSignalPersistence': path.join(
      here,
      'shims/persistence.ts',
    ),
    '@/services/e2ee': path.join(cryptoRoot, 'e2ee'),
    '@/services/e2ee/e2eeDeviceStore': path.join(
      cryptoRoot,
      'e2ee/e2eeDeviceStore.ts',
    ),
    '@/services/e2ee/e2eeMessageCrypto': path.join(
      cryptoRoot,
      'e2ee/e2eeMessageCrypto.ts',
    ),
    '@/services/voice/mls': path.join(cryptoRoot, 'mls'),
    '@/services/voice/e2ee': path.join(cryptoRoot, 'voice'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('wrote', path.relative(repoRoot, outfile));
