// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ESLint } from 'eslint';

describe('Property ordering rules', () => {
  const overrideConfig = [{ languageOptions: { parserOptions: { projectService: false } } }];
  const eslint = new ESLint({ overrideConfig });
  const fixer = new ESLint({ fix: true, overrideConfig });
  const filePath = 'src/types/torrent.ts';

  it('should reject reversed Cyrillic properties in objects, types, interfaces, and classes', async () => {
    const cases = [
      { rule: 'sort-objects', source: "export const sample = { 'Я': 1, 'А': 2 };\n" },
      { rule: 'sort-object-types', source: 'export type Sample = { Я: number; А: number };\n' },
      { rule: 'sort-interfaces', source: 'export interface Sample { Я: number; А: number }\n' },
      { rule: 'sort-classes', source: 'export class Sample { Я = 1; А = 2; }\n' },
    ];

    for (const { rule, source } of cases) {
      const [result] = await eslint.lintText(source, { filePath });
      assert.ok(result.messages.some(message => message.ruleId === `perfectionist/${rule}`), rule);
      const [fixed] = await fixer.lintText(source, { filePath });
      assert.ok(fixed.output && fixed.output.indexOf('А') < fixed.output.indexOf('Я'), rule);
    }
  });

  it('should sort mixed Unicode keys in UTF-8 byte order and preserve that order on repeated fixes', async () => {
    const keys = ['😀', 'Б', '𐀀', 'A', 'А', 'a', 'Ā', 'Ё', '\uE000'];
    const source = `export const sample = { ${keys.map(key => `'${key}': 1`).join(', ')} };\n`;
    const [fixed] = await fixer.lintText(source, { filePath });
    assert.ok(fixed.output);
    const actualKeys = [...fixed.output.matchAll(/'([^']+)':/g)].map(match => match[1]);
    const expectedKeys = [...keys].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    assert.deepEqual(actualKeys, expectedKeys);

    const [repeated] = await fixer.lintText(fixed.output, { filePath });
    assert.equal(repeated.output, undefined);
  });

  it('should remove extra empty lines at the end of files', async () => {
    const [result] = await fixer.lintText('export const sample = 1;\n\n', { filePath });
    assert.equal(result.output, 'export const sample = 1;\n');
  });
});
