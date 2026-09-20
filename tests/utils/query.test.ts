// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getQueryInteger, getQueryString, safeParseInt } from '../../src/utils/query.js';

describe('safeParseInt', () => {
  it('should parse integer strings and numbers', () => {
    assert.equal(safeParseInt('42'), 42);
    assert.equal(safeParseInt(' 7 '), 7);
    assert.equal(safeParseInt(3), 3);
  });

  it('should return the default for missing, repeated, or non-numeric values', () => {
    assert.equal(safeParseInt(undefined, 5), 5);
    assert.equal(safeParseInt(['1', '2'], 5), 5);
    assert.equal(safeParseInt('abc', 5), 5);
    assert.equal(safeParseInt('abc'), undefined);
  });
});

describe('getQueryString', () => {
  it('should return the first non-empty string among the named parameters', () => {
    assert.equal(getQueryString({ Query: '', q: 'sample' }, 'Query', 'q'), 'sample');
    assert.equal(getQueryString({}, 'q'), undefined);
  });

  it('should take the first string of a repeated parameter and ignore non-strings', () => {
    assert.equal(getQueryString({ q: ['first', 'second'] }, 'q'), 'first');
    assert.equal(getQueryString({ q: { nested: 'value' } }, 'q'), undefined);
  });
});

describe('getQueryInteger', () => {
  it('should return the default when no named parameter is present', () => {
    assert.equal(getQueryInteger({}, ['limit', 'Limit'], 1, 100), 100);
    assert.equal(getQueryInteger({}, ['offset'], 0), undefined);
  });

  it('should read the first present parameter', () => {
    assert.equal(getQueryInteger({ Limit: ' 25 ' }, ['limit', 'Limit'], 1, 100), 25);
    assert.equal(getQueryInteger({ offset: ['0', '10'] }, ['offset'], 0), 0);
  });

  it('should return null for values below the minimum or not integers', () => {
    assert.equal(getQueryInteger({ limit: '0' }, ['limit'], 1, 100), null);
    assert.equal(getQueryInteger({ offset: '-5' }, ['offset'], 0), null);
    assert.equal(getQueryInteger({ limit: '2.5' }, ['limit'], 1, 100), null);
    assert.equal(getQueryInteger({ limit: 'many' }, ['limit'], 1, 100), null);
    assert.equal(getQueryInteger({ limit: ' ' }, ['limit'], 1, 100), null);
    assert.equal(getQueryInteger({ limit: '9007199254740992' }, ['limit'], 1, 100), null);
  });
});
