/**
 * Theme-focused Stylelint: raw palette literals in UI-layer SCSS and Vue SFC styles.
 * Token layer: themes.scss ignored (AGENTS.md).
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
    'src/assets/themes.scss',
    'src/assets/themes/**',
  ],
  overrides: [
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
      rules: colorRules,
    },
    /* Legacy SCSS entrypoints still carry raw palette literals; token migration tracked separately. */
    {
      files: [
        'src/assets/main.scss',
        'src/assets/accessibility.scss',
        'src/components/expandedProfileShared.scss',
        'src/features/channel-panel/styles/channelPanel.scss',
        'src/features/channel-panel/styles/channelPanelListParticipant.scss',
        'src/features/chat/styles/messageBubble.scss',
        'src/features/settings/styles/settingsModal.scss',
        'src/features/voice/styles/wordlineActivity.scss',
        'src/features/voice/styles/ticTacToeActivity.scss',
        'src/features/paper/styles/paperTheme.scss',
      ],
      customSyntax: 'postcss-scss',
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
    /* Theme swatch miniatures: explicit hex/rgba mirroring themes.scss (token file is ignored). */
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
