export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', process: 'readonly', console: 'readonly', ImageData: 'readonly', Buffer: 'readonly', URL: 'readonly', btoa: 'readonly', atob: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^_' }], 'no-undef': 'error' },
  },
];
