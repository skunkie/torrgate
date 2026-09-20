// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDecimalNumber, parseSizeBytes } from '../../src/utils/size.js';

describe('Size Utilities', () => {
  it('should parse gigabytes into bytes', () => {
    assert.equal(parseSizeBytes('1.5 GB'), 1610612736);
    assert.equal(parseSizeBytes('1.5 ГБ'), 1610612736);
  });

  it('should parse megabytes into bytes', () => {
    assert.equal(parseSizeBytes('500 MB'), 524288000);
    assert.equal(parseSizeBytes('500 МБ'), 524288000);
  });

  it('should handle comma decimal separators', () => {
    assert.equal(parseSizeBytes('2,5 GB'), 2684354560);
  });

  it('should parse bare byte values', () => {
    assert.equal(parseSizeBytes('1024 B'), 1024);
    assert.equal(parseSizeBytes('1024'), 1024);
  });

  it('should parse sizes with trailing parentheses, notes or counts', () => {
    assert.equal(parseSizeBytes('1.45 GB (1557856051)'), 1556925645);
    assert.equal(parseSizeBytes('500 MB / 4 files'), 524288000);
    assert.equal(parseSizeBytes('10.33 GB [verified]'), 11091753042);
  });

  it('should return zero for empty or invalid size strings', () => {
    assert.equal(parseSizeBytes(''), 0);
    assert.equal(parseSizeBytes('invalid'), 0);
  });

  it('should parse sizes with space, comma or dot digit grouping', () => {
    assert.equal(parseSizeBytes('1 234,5 МБ'), Math.round(1234.5 * 1024 * 1024));
    assert.equal(parseSizeBytes('1,234.5 MB'), Math.round(1234.5 * 1024 * 1024));
    assert.equal(parseSizeBytes('1\u00A0024 KB'), 1024 * 1024);
    assert.equal(parseSizeBytes('1,45 ГБ'), Math.round(1.45 * 1024 * 1024 * 1024));
  });

  it('should normalize grouping and decimal separators', () => {
    assert.equal(normalizeDecimalNumber('1.234.567'), '1234567');
    assert.equal(normalizeDecimalNumber('1.234.567,89'), '1234567.89');
    assert.equal(normalizeDecimalNumber('10.33'), '10.33');
    assert.equal(normalizeDecimalNumber('10,33'), '10.33');
  });
});
