import path from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
      // Ratchet upward as suites grow (see docs/plans/test-coverage-plan.md).
      thresholds: {
        lines: 10,
        statements: 10,
        functions: 60,
        branches: 65,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});
