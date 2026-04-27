const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')

module.exports = tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'eslint.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
    },
  },
)
