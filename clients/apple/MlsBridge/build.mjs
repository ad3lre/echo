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
    '@/services/e2ee/e2eeBase64': path.join(here, 'shims/e2eeBase64.ts'),
    '@/services/e2ee/e2eeSignalPersistence': path.join(
      here,
      'shims/persistence.ts',
    ),
    '@/services/voice/mls': path.join(cryptoRoot, 'mls'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('wrote', path.relative(repoRoot, outfile));
