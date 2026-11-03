import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueA11y from 'eslint-plugin-vuejs-accessibility';

export default tseslint.config(
  { ignores: ['dist/', 'dist-populated/', 'node_modules/', 'test-results/', 'playwright-report/', 'lighthouse/', 'fonts-src/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueA11y.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    // VoiceOver drops the list role of a list styled without bullets: role="list" restates it on purpose.
    rules: { 'vuejs-accessibility/no-redundant-roles': ['error', { ul: ['list'] }] },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: { globals: { __BUILD_DATE__: 'readonly', __BACK_VARIANT__: 'readonly' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  { files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
);
