export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', process: 'readonly', console: 'readonly',
      },
    },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error' },
  },
];
