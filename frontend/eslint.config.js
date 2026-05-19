import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Theme enforcement: catch Tailwind palette literals in class strings and TS.
 * SCSS / Vue styles are excluded — ESLint cannot parse them; use `npm run lint:style` (AGENTS.md).
 */
const themeColorLiterals = [
  'error',
  {
    selector:
      'Literal[value=/\\bbg-(?:black|white|gray-\\d|slate-\\d|zinc-\\d)/]',
    message:
      'Use semantic token utilities (bg-bg, bg-surface, bg-elevated) instead of hardcoded Tailwind colors. See AGENTS.md.',
  },
  {
    selector:
      'Literal[value=/\\btext-(?:black|white|gray-\\d|slate-\\d|zinc-\\d)/]',
    message:
      'Use semantic token utilities (text-foreground, text-muted) instead of hardcoded Tailwind colors. See AGENTS.md.',
  },
  {
    selector: 'Literal[value=/\\b(?:bg|text|border)-\\[#[0-9a-fA-F]{3,8}\\]/]',
    message:
      'Arbitrary hex in Tailwind classes breaks theming. Use semantic utilities or var(--token). See AGENTS.md.',
  },
  {
    selector: 'Literal[value=/\\btext-white\\//]',
    message:
      'Use theme-aware text utilities (text-fg, text-fg-soft, text-fg-subtle, text-foreground, text-muted). See docs/plans/theme-system-progress.md.',
  },
  {
    selector: 'Literal[value=/\\bbg-white\\//]',
    message:
      'Use theme-aware surfaces (bg-glass-1…3, bg-scrim-*, bg-overlay-*). See docs/plans/theme-system-progress.md.',
  },
  {
    selector: 'Literal[value=/\\bbg-black\\//]',
    message:
      'Use theme overlays (bg-overlay-dim, bg-overlay-heavy, bg-overlay-ink, bg-scrim-*). See docs/plans/theme-system-progress.md.',
  },
];

const baseIgnores = {
  ignores: [
    'dist/**',
    'cypress/**',
    'node_modules/**',
    'coverage/**',
    'src/assets/themes.css',
    '**/*.scss',
    '**/vite-env.d.ts',
  ],
};

const themeStrict = process.env.ESLINT_THEME_STRICT === '1';
const perfStrict = process.env.ESLINT_PERF_STRICT === '1';
const lintStrict = process.env.ESLINT_STRICT === '1';

const perfRiskRules = [
  lintStrict ? 'error' : 'warn',
  {
    selector:
      "CallExpression[callee.name='watch'] ObjectExpression > Property[key.name='deep'] > Literal[value=true]",
    message:
      'Deep watch can cause broad reactive churn on hot paths; prefer explicit deps or justify in comments.',
  },
  {
    selector: "CallExpression[callee.property.name='sort']",
    message:
      'Full-array .sort() can be expensive on hot paths; prefer indexed/ordered structures or justify local usage.',
  },
];

export default themeStrict
  ? tseslint.config(
      baseIgnores,
      {
        linterOptions: {
          reportUnusedDisableDirectives: lintStrict ? 'error' : 'off',
        },
      },
      {
        files: ['src/**/*.vue'],
        languageOptions: {
          parser: vueParser,
          parserOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
          },
        },
        plugins: {
          '@typescript-eslint': tseslint.plugin,
        },
        rules: {
          'no-restricted-syntax': themeColorLiterals,
          '@typescript-eslint/no-explicit-any': 'off',
          'no-console': 'off',
        },
      },
      {
        files: ['src/**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          ecmaVersion: 2022,
          sourceType: 'module',
        },
        plugins: {
          '@typescript-eslint': tseslint.plugin,
        },
        rules: {
          'no-restricted-syntax': themeColorLiterals,
          '@typescript-eslint/no-explicit-any': 'off',
          'no-console': 'off',
        },
      },
      {
        files: ['src/**/*.ts'],
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir: __dirname,
          },
        },
        rules: {
          '@typescript-eslint/no-floating-promises': 'error',
        },
      },
      ...(perfStrict
        ? [
            {
              files: ['src/**/*.vue', 'src/**/*.ts'],
              rules: {
                'no-restricted-syntax': perfRiskRules,
              },
            },
          ]
        : []),
    )
  : tseslint.config(
      baseIgnores,
      {
        linterOptions: {
          reportUnusedDisableDirectives: lintStrict ? 'error' : 'off',
        },
      },

      js.configs.recommended,

      ...tseslint.configs.recommended,

      ...pluginVue.configs['flat/essential'],

      {
        files: ['src/**/*.vue'],
        languageOptions: {
          parserOptions: {
            parser: tseslint.parser,
          },
        },
      },

      {
        files: ['src/**/*.vue', 'src/**/*.ts'],
        rules: {
          'no-restricted-syntax': themeColorLiterals,
          '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
          ],
          'no-console': lintStrict
            ? ['warn', { allow: ['warn', 'error'] }]
            : 'off',
          'no-undef': 'off',
        },
      },
      ...(perfStrict
        ? [
            {
              files: ['src/**/*.vue', 'src/**/*.ts'],
              rules: {
                'no-restricted-syntax': perfRiskRules,
              },
            },
          ]
        : []),

      {
        files: [
          'src/features/settings/components/**/*.vue',
          'src/features/server-settings/components/**/*.vue',
        ],
        rules: {
          // SettingsModal passes a shared mutable form/role snapshot; full v-model+emit refactor is tracked separately.
          'vue/no-mutating-props': 'off',
        },
      },

      {
        files: ['src/components/**/*.vue'],
        ignores: ['src/components/AppLayout.vue'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                {
                  name: '@/composables/useSocket',
                  message:
                    'Socket usage belongs in composables/services wired by AppLayout — not in raw UI components.',
                },
                {
                  name: '@/features/layout/composables/useRailNavigation',
                  message:
                    'Rail navigation must flow through AppLayout controller (props/inject), not direct composable use in components.',
                },
              ],
            },
          ],
        },
      },

      {
        rules: {
          '@typescript-eslint/no-explicit-any': lintStrict ? 'warn' : 'off',
        },
      },

      /** Type-aware rules for TS only (Vue SFC scripts: follow-up). Catches ignored Promises (silent async failures). */
      {
        files: ['src/**/*.ts'],
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir: __dirname,
          },
        },
        rules: {
          '@typescript-eslint/no-floating-promises': 'error',
          '@typescript-eslint/no-misused-promises': lintStrict
            ? ['warn', { checksVoidReturn: false }]
            : 'off',
          '@typescript-eslint/consistent-type-imports': lintStrict
            ? ['warn', { prefer: 'type-imports' }]
            : 'off',
        },
      },
    );
