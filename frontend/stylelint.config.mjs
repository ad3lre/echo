/**
 * Theme-focused Stylelint: raw palette literals in UI-layer SCSS and Vue SFC styles.
 * Token layer: themes.css ignored (AGENTS.md).
 */
/** @type {import('stylelint').Config} */
const colorRules = {
  'color-no-hex': [
    true,
    {
      ignore: ['inside-function'],
    },
  ],
  'function-disallowed-list': [
    [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklch',
      'oklab',
      'color',
    ],
    {
      ignore: ['inside-function'],
    },
  ],
};

export default {
  rules: {},
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'src/assets/themes.css',
  ],
  overrides: [
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
      rules: colorRules,
    },
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
      rules: colorRules,
    },
    /* Theme swatch miniatures: explicit hex/rgba mirroring themes.css (token file is ignored). */
    {
      files: ['src/features/settings/components/SettingsAppearance.vue'],
      customSyntax: 'postcss-html',
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};
