// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coerceTorznabInteger, foldQueryNameCase, getTorznabQueryString, parseRequestQuery, parseTorznabInteger } from '../../src/jackett/query.js';
import { getQueryString } from '../../src/utils/query.js';

describe('foldQueryNameCase', () => {
  it('should key parameters by lowercase name', () => {
    assert.deepEqual({ ...foldQueryNameCase({ Q: 'Sample Film', YEAR: '2024', t: 'movie' }) }, { q: 'Sample Film', t: 'movie', year: '2024' });
  });

  it('should combine values of names that differ only in case in URL order', () => {
    assert.deepEqual({ ...foldQueryNameCase({ Year: '2024', year: ['2025', '2026'] }) }, { year: ['2024', '2025', '2026'] });
  });

  it('should keep names that match Object.prototype properties as ordinary parameters', () => {
    const folded = foldQueryNameCase({ Constructor: 'x', __PROTO__: { t: 'caps' }, t: 'movie' });
    assert.equal(Object.getPrototypeOf(folded), null);
    assert.equal(folded.constructor, 'x');
    assert.deepEqual(folded.__proto__, { t: 'caps' });
    assert.equal(getQueryString(folded, 't'), 'movie');
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

describe('getTorznabQueryString', () => {
  it('should read an empty or whitespace-only value as absent, as Jackett binds strings', () => {
    for (const sampleValue of ['', ' ', '\t\n']) {
      assert.equal(getTorznabQueryString({ imdbid: sampleValue }, 'imdbid'), undefined, JSON.stringify(sampleValue));
    }
    assert.equal(getTorznabQueryString({}, 'imdbid'), undefined);
  });

  it('should keep a value with content as it was sent and read only the first value', () => {
    assert.equal(getTorznabQueryString({ artist: ' Test Artist ' }, 'artist'), ' Test Artist ');
    assert.equal(getTorznabQueryString({ artist: [' ', 'Test Artist'] }, 'artist'), undefined);
  });
});

describe('parseTorznabInteger', () => {
  it('should parse signed integers with surrounding whitespace', () => {
    assert.equal(parseTorznabInteger('1'), 1);
    assert.equal(parseTorznabInteger(' 2 '), 2);
    assert.equal(parseTorznabInteger('+3'), 3);
    assert.equal(parseTorznabInteger('-1'), -1);
    assert.equal(parseTorznabInteger('0'), 0);
    assert.equal(parseTorznabInteger('2024'), 2024);
  });

  it('should treat absent and blank values as no value', () => {
    assert.equal(parseTorznabInteger(undefined), undefined);
    assert.equal(parseTorznabInteger(''), undefined);
    assert.equal(parseTorznabInteger('   '), undefined);
  });

  it('should reject values that are not 32-bit integers', () => {
    for (const sampleValue of ['abc', '1.5', '1e3', '2x', '2147483648', '-2147483649']) {
      assert.equal(parseTorznabInteger(sampleValue), null, sampleValue);
    }
    assert.equal(parseTorznabInteger('2147483647'), 2147483647);
  });
});

describe('coerceTorznabInteger', () => {
  it('should keep only digits and separators, as Jackett coerces limit and offset', () => {
    assert.equal(coerceTorznabInteger('25'), 25);
    assert.equal(coerceTorznabInteger('-5'), 5);
    assert.equal(coerceTorznabInteger('10abc'), 10);
    assert.equal(coerceTorznabInteger('many'), 0);
    assert.equal(coerceTorznabInteger('1.5'), 15);
    assert.equal(coerceTorznabInteger('1,000'), 1000);
    assert.equal(coerceTorznabInteger('1,000.00'), 1000);
  });

  it('should treat absent and blank values as unset', () => {
    assert.equal(coerceTorznabInteger(undefined), undefined);
    assert.equal(coerceTorznabInteger('  '), undefined);
  });

  it('should reject values that are not 32-bit integers after coercion', () => {
    for (const sampleValue of ['2147483648', '1,000.5', ',']) {
      assert.equal(coerceTorznabInteger(sampleValue), null, sampleValue);
    }
    assert.equal(coerceTorznabInteger('2147483647'), 2147483647);
  });
});

describe('Raw query parameter folding', () => {
  it('should preserve URL order across repeated names with different casing', () => {
    const query = foldQueryNameCase(new URLSearchParams('Category=2000&category=5000&Category=5040'));
    assert.deepEqual(query.category, ['2000', '5000', '5040']);
  });
});

describe('parseRequestQuery', () => {
  it('should retain the first spelling while grouping case-insensitive names', () => {
    const query = parseRequestQuery('/results?Tracker[]=rutor&tracker[]=kinozal&query=Sample?Draft');
    assert.deepEqual(query.getAll('Tracker[]'), ['rutor', 'kinozal']);
    assert.equal(query.get('query'), 'Sample?Draft');
  });

  it('should read an absent query as empty', () => {
    assert.deepEqual([...parseRequestQuery('/results')], []);
  });
});
