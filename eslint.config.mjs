// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

// Perfectionist compares UTF-16 units. Separate low and high surrogates keep its alphabet
// intact while placing supplementary Unicode characters after the BMP in UTF-8 byte order.
const ALPHABETICAL_ORDER = {
  alphabet: [
    ...Array.from({ length: 0xd800 }, (_, index) => String.fromCharCode(index)),
    ...Array.from({ length: 0x2000 }, (_, index) => String.fromCharCode(index + 0xe000)),
    ...Array.from({ length: 0x400 }, (_, index) => String.fromCharCode(index + 0xdc00)),
    ...Array.from({ length: 0x400 }, (_, index) => String.fromCharCode(index + 0xd800)),
  ].join(''),
  ignoreCase: false,
  type: 'custom',
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.mjs'],
  },
  {
    files: ['api/**/*.ts', 'src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
      '@stylistic/ts': stylistic,
      'perfectionist': perfectionist,
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/ts/arrow-parens': ['error', 'as-needed'],
      '@stylistic/ts/comma-spacing': ['error', { after: true, before: false }],
      '@stylistic/ts/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'semi',
            requireLast: true,
          },
          singleline: {
            delimiter: 'semi',
            requireLast: false,
          },
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'perfectionist/sort-interfaces': ['error', ALPHABETICAL_ORDER],
      'perfectionist/sort-classes': ['error', {
        ...ALPHABETICAL_ORDER,
        customGroups: [{
          anyOf: [{ selector: 'method' }, { selector: 'get-method' }, { selector: 'set-method' }],
          groupName: 'methods',
          type: 'unsorted',
        }],
        groups: [['property', 'accessor-property', 'function-property'], 'constructor', 'methods', 'unknown'],
      }],
      'perfectionist/sort-object-types': ['error', ALPHABETICAL_ORDER],
      'perfectionist/sort-objects': ['error', ALPHABETICAL_ORDER],
      'prefer-const': 'error',
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
