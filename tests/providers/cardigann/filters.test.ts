// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { applyFilters } from '../../../src/providers/cardigann/filters.js';
import { TemplateContext } from '../../../src/providers/cardigann/types.js';
import { normalizeDate } from '../../../src/utils/date.js';

describe('Cardigann Filters Engine', () => {
  const testContext: TemplateContext = {};

  it('should apply trim filter', () => {
    const input = '  sample text with spaces  ';
    const result = applyFilters(input, [{ name: 'trim' }], testContext);
    assert.equal(result, 'sample text with spaces');
  });

  it('should extract the first capture group with the regexp filter', () => {
    assert.equal(applyFilters('topic/42/details', [{ args: 'topic/(\\d+)', name: 'regexp' }], testContext), '42');
    assert.equal(applyFilters('missing', [{ args: 'topic/(\\d+)', name: 'regexp' }], testContext), '');
    assert.equal(applyFilters('topic/42', [{ args: '[', name: 'regexp' }], testContext), '');
  });

  it('should replace diacritics using canonical Unicode decomposition', () => {
    assert.equal(applyFilters('Tést Rélèase / Пример', [{ args: 'replace', name: 'diacritics' }], testContext), 'Test Release / Пример');
  });

  it('should apply replace filter', () => {
    const input = 'sample-old-value';
    const result = applyFilters(
      input,
      [{ args: ['-old-', '-new-'], name: 'replace' }],
      testContext
    );
    assert.equal(result, 'sample-new-value');
  });

  it('should apply re_replace with capture groups', () => {
    const input = '/torrent/123456/sample-release';
    const result = applyFilters(
      input,
      [{ args: ['/torrent/(\\d+).*', '$1'], name: 're_replace' }],
      testContext
    );
    assert.equal(result, '123456');
  });

  it('should apply re_replace with case-insensitive (?i) flag', () => {
    const input = 'Example HDTV-Rip Release';
    const result = applyFilters(
      input,
      [{ args: ['(?i)hdtv-rip', 'HDTV'], name: 're_replace' }],
      testContext
    );
    assert.equal(result, 'Example HDTV Release');
  });

  it('should apply append and prepend filters', () => {
    let result = applyFilters('core', [{ args: ' [SampleTag]', name: 'append' }], testContext);
    assert.equal(result, 'core [SampleTag]');

    result = applyFilters('core', [{ args: 'Prefix: ', name: 'prepend' }], testContext);
    assert.equal(result, 'Prefix: core');
  });

  it('should apply split filter with index', () => {
    const input = 'part1 / part2 / part3';
    const result = applyFilters(input, [{ args: ['/', 1], name: 'split' }], testContext);
    assert.equal(result, 'part2');
  });

  it('should apply querystring filter', () => {
    const input = 'https://example.org/forum/viewtopic.php?t=654321&sp=1';
    const result = applyFilters(input, [{ args: 't', name: 'querystring' }], testContext);
    assert.equal(result, '654321');
  });

  it('should apply dateparse filter using normalizeDate', () => {
    const input = '15-Авг-24';
    const result = applyFilters(input, [{ name: 'dateparse' }], testContext);
    assert.equal(result, '2024-08-15');
  });

  it('should retain relative-day context when a date filter pipeline leaves only a time', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-22T22:30:00Z') });
    try {
      assert.equal(applyFilters('Вчера, 14:30', [
        { args: ['(Вчера|\\s|,)+', ' '], name: 're_replace' },
        { args: ':00 +03:00', name: 'append' },
        { args: 'd MMM yy HH:mm:ss zzz', name: 'dateparse' },
      ], testContext, { timeZone: 'Europe/Moscow' }), '2026-09-22T11:30:00.000Z');
    } finally {
      mock.timers.reset();
    }
  });

  it('should prefer an explicitly parsed date over a relative label in the original value', () => {
    assert.equal(applyFilters('Yesterday 15-Nov-17, 12:40', [
      { args: ['Yesterday ', ''], name: 'replace' },
      { name: 'dateparse' },
    ], testContext, { timeZone: 'Europe/Moscow' }), '15-Nov-17, 12:40');
  });

  it('should apply tolower and toupper filters', () => {
    assert.equal(applyFilters('HELLO World', [{ name: 'tolower' }], testContext), 'hello world');
    assert.equal(applyFilters('hello world', [{ name: 'toupper' }], testContext), 'HELLO WORLD');
  });

  it('should apply urldecode and urlencode filters', () => {
    const encoded = applyFilters('hello world & more', [{ name: 'urlencode' }], testContext);
    assert.equal(encoded, 'hello%20world%20%26%20more');
    assert.equal(
      applyFilters(encoded, [{ name: 'urldecode' }], testContext),
      'hello world & more'
    );
  });

  it('should apply default filter when value is empty', () => {
    assert.equal(
      applyFilters('', [{ args: 'fallback', name: 'default' }], testContext),
      'fallback'
    );
    assert.equal(
      applyFilters('existing', [{ args: 'fallback', name: 'default' }], testContext),
      'existing'
    );
  });

  it('should apply fuzzytime filter', () => {
    const today = new Date();
    const expectedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    assert.equal(applyFilters('Today 15:00', [{ name: 'fuzzytime' }], testContext), `${expectedToday} 15:00`);
    assert.equal(applyFilters('Вчера 20:00', [{ name: 'fuzzytime' }], testContext), `${normalizeDate('вчера')} 20:00`);
  });

  it('should apply re_replace with Unicode category patterns like \\p{IsCyrillic}', () => {
    const input = 'Пример Фильма / Example Movie';
    const result = applyFilters(
      input,
      [{ args: ['^[\\p{IsCyrillic}\\s\\/]+', ''], name: 're_replace' }],
      testContext
    );
    assert.equal(result, 'Example Movie');
  });

  it('should count split indexes from the end when negative', () => {
    assert.equal(applyFilters('a/b/c', [{ args: ['/', -1], name: 'split' }], testContext), 'c');
    assert.equal(applyFilters('a/b/c', [{ args: ['/', 1], name: 'split' }], testContext), 'b');
  });

  it('should extract query parameters whose names contain regex characters', () => {
    assert.equal(applyFilters('details.php?t(id)=42&x=1', [{ args: 't(id)', name: 'querystring' }], testContext), '42');
  });

  it('should fall back to pattern matching when the value is not a parseable URL', () => {
    assert.equal(applyFilters('http://[bad?t(id)=7&x=1', [{ args: 't(id)', name: 'querystring' }], testContext), '7');
    assert.equal(applyFilters('http://[bad?id=50%ZZ', [{ args: 'id', name: 'querystring' }], testContext), '50%ZZ');
  });

  it('should keep malformed percent escapes instead of throwing', () => {
    assert.equal(applyFilters('details.php?id=50%ZZ', [{ args: 'id', name: 'querystring' }], testContext), '50%ZZ');
    assert.equal(applyFilters('Example%E0%A4Release', [{ name: 'urldecode' }], testContext), 'Example%E0%A4Release');
  });
});
