// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyFilters } from '../../../src/providers/cardigann/filters.js';
import { compileGoRegExp } from '../../../src/providers/cardigann/regex.js';

describe('compileGoRegExp', () => {
  it('should turn a leading Go flag group into JavaScript flags', () => {
    assert.equal(compileGoRegExp('(?i)sample')?.flags, 'i');
    assert.equal(compileGoRegExp('(?is)a.b', 'g')?.flags, 'gis');
    assert.equal(compileGoRegExp('(?m)^line$')?.test('first\nline'), true);
  });

  it('should translate Go Unicode script classes and enable Unicode mode', () => {
    const regex = compileGoRegExp('\\p{IsCyrillic}+', 'g');
    assert.ok(regex?.flags.includes('u'));
    assert.equal('Пример Example'.replace(regex!, ''), ' Example');
  });

  it('should return undefined for patterns JavaScript cannot express', () => {
    assert.equal(compileGoRegExp('(?U)a+'), undefined);
    assert.equal(compileGoRegExp('['), undefined);
  });
});

describe('Go regular expressions in filters', () => {
  it('should honor (?i) in the regexp filter', () => {
    assert.equal(applyFilters('SEASON 3', [{ args: '(?i)season (\\d+)', name: 'regexp' }], {}), '3');
  });

  it('should honor (?s) in the re_replace filter', () => {
    assert.equal(applyFilters('Sample\nRelease', [{ args: ['(?s)Sample.Release', 'Done'], name: 're_replace' }], {}), 'Done');
  });

  it('should leave the value unchanged when re_replace cannot compile its pattern', () => {
    assert.equal(applyFilters('Sample Release', [{ args: ['(?U)Sample', 'Done'], name: 're_replace' }], {}), 'Sample Release');
  });
});
