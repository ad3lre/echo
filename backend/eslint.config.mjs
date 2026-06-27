import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },

  {
    // Type-aware linting only covers files in the build tsconfig. `src/tests` is
    // deliberately excluded there (tests run via tsx, never compiled), so the project
    // service can't resolve them — scope the typed rules to non-test source.
    files: ['src/**/*.ts'],
    ignores: ['src/tests/**', '**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  {
    files: [
      'src/sockets/handlers.ts',
      'src/sockets/typingHandler.ts',
      'src/sockets/dmCallSignalHandler.ts',
      'src/sockets/paperCollabHandler.ts',
      'src/sockets/paperWatchHandler.ts',
    ],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  {
    files: ['src/tests/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
