// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeImdbId, parseImdbIdSearchTerm } from '../../src/utils/imdb.js';

describe('normalizeImdbId', () => {
  it('should normalize ids with or without the tt prefix to seven or more digits', () => {
    assert.equal(normalizeImdbId('tt0123456'), 'tt0123456');
    assert.equal(normalizeImdbId('123456'), 'tt0123456');
    assert.equal(normalizeImdbId('tt12345678'), 'tt12345678');
    assert.equal(normalizeImdbId('tt12345678\n'), 'tt12345678');
    assert.equal(normalizeImdbId('tt00000042'), 'tt0000042');
  });

  it('should return undefined for empty values and null for invalid ones', () => {
    for (const value of [undefined, '', '  ', '\t\n']) {
      assert.equal(normalizeImdbId(value), undefined);
    }
    for (const value of ['TT12345678', ' tt0123456', 'tt0123456 ', 'tt123456789', 'tt12345678\r\n']) {
      assert.equal(normalizeImdbId(value), null, value);
    }
    assert.equal(normalizeImdbId('tt'), null);
    assert.equal(normalizeImdbId('tt0000000'), null);
    assert.equal(normalizeImdbId('nm0123456'), null);
    assert.equal(normalizeImdbId('tt12a'), null);
  });
});

describe('parseImdbIdSearchTerm', () => {
  it('should read tt followed by one to eight digits as a canonical IMDb id', () => {
    assert.equal(parseImdbIdSearchTerm('tt123456'), 'tt0123456');
    assert.equal(parseImdbIdSearchTerm('tt12345678'), 'tt12345678');
  });

  it('should drop punctuation Jackett strips before reading the id', () => {
    assert.equal(parseImdbIdSearchTerm('tt0123456!'), 'tt0123456');
    assert.equal(parseImdbIdSearchTerm('tt0123456,'), 'tt0123456');
    assert.equal(parseImdbIdSearchTerm('"tt0123456"'), 'tt0123456');
  });

  it('should leave other search terms alone', () => {
    for (const term of ['123456', 'TT123456', 'tt123456789', 'tt0000000', 'tt123456 Sample', 'Sample Show', 'tt0123456\u2013', 'tt0123456\u00b4']) {
      assert.equal(parseImdbIdSearchTerm(term), undefined, term);
    }
  });
});
