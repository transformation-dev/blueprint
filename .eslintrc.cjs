module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  // plugins: [
  //   'svelte3',
  // ],
  // overrides: [
  //   {
  //     files: ['*.svelte'],
  //     processor: 'svelte3/svelte3',
  //   },
  // ],
  ignorePatterns: ['*.svelte', '*.html'],
  rules: {
    semi: ['error', 'never'],
    'no-plusplus': 'off',
    'no-else-return': 'off',
    'import/prefer-default-export': 'off',
    'no-multi-spaces': 'off',
    'max-len': ['error', 256],
    'no-unused-vars': 'warn',
    'import/extensions': 'off',
  },
}
