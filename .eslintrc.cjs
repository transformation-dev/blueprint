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
  globals: {
    cy: true,
    context: true,
    it: true,
    expect: true,
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
    'no-restricted-syntax': 'off',
    'max-classes-per-file': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true, optionalDependencies: false }],
    'object-curly-newline': 'off',
    'space-before-function-paren': 'off',
  },
}
