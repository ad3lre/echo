import path from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      './src/features/paper/**/*.test.ts',
      '../../server/backend/crypto/src/**/*.test.ts',
      '../../server/backend/crypto/src/**/__tests__/**/*.test.ts',
      '../../contracts/**/*.test.ts',
      '../../server/backend/src/tests/channels/channelHandlers*.test.ts',
      '../../server/backend/src/tests/uploads/messagePlainTextProjectionImageSlot.test.ts',
      '../../server/backend/src/tests/uploads/imageSlotFillOps.test.ts',
    ],
    exclude: [
      '../../contracts/mediaCdn.test.ts',
      '../../contracts/mediaCdnVariants.test.ts',
    ],
    setupFiles: ['./src/test/vitestSetup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Scope to TS under src so build artifacts and .vue don’t dilute the gate.
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/node_modules/**',
        '**/dist/**',
        'src/main.ts',
        'src/vite-env.d.ts',
        'src/dev/**',
      ],
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 60,
        branches: 65,
      },
    },
  },
  resolve: {
    alias: {
      '@/services/e2ee': path.resolve(
        __dirname,
        '../../server/backend/crypto/src/e2ee',
      ),
      '@/services/voice/mls': path.resolve(
        __dirname,
        '../../server/backend/crypto/src/mls',
      ),
      '@': path.resolve(__dirname, './src'),
      '@shared/games': path.resolve(
        __dirname,
        '../../server/activities/cores/games',
      ),
      '@shared/vcActivityCatalog': path.resolve(
        __dirname,
        '../../server/activities/cores/vcActivityCatalog',
      ),
      '@shared': path.resolve(__dirname, '../../contracts'),
    },
  },
});
