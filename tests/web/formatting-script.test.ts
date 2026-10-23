// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { FORMATTING_SCRIPT } from '../../src/web/client/formatting-script.js';

describe('browser size formatting', () => {
  it('should format fractional bytes and large sizes with defined units', context => {
    const dom = new JSDOM('', { runScripts: 'outside-only' });
    context.after(() => dom.window.close());
    const formatBytes = dom.window.eval(`${FORMATTING_SCRIPT}\ncreateFormatting().formatBytes;`) as (bytes: number) => string;

    for (const [bytes, expected] of [
      [1024 ** 5, '1 PB'],
      [1024 ** 6, '1 EB'],
      [1024 ** 7, '1024 EB'],
      [0.5, '0.5 B'],
      [1, '1 B'],
      [1024, '1 KB'],
      [1.5 * 1024 ** 3, '1.5 GB'],
      [1024 ** 4, '1 TB'],
    ] as const) {
      assert.equal(formatBytes(bytes), expected, String(bytes));
    }
  });

  it('should distinguish missing sizes from zero and invalid numeric sizes', context => {
    const dom = new JSDOM('', { runScripts: 'outside-only' });
    context.after(() => dom.window.close());
    const formatBytes = dom.window.eval(`${FORMATTING_SCRIPT}\ncreateFormatting().formatBytes;`) as (bytes: null | number | undefined) => string;

    assert.equal(formatBytes(null), '—');
    assert.equal(formatBytes(undefined), '—');
    for (const bytes of [0, -1, NaN, Infinity, -Infinity]) {
      assert.equal(formatBytes(bytes), '0 B', String(bytes));
    }
  });
});

describe('browser URL safety', () => {
  it('should allow HTTP and HTTPS links and reject invalid values and other protocols', context => {
    const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://gateway.example.test/' });
    context.after(() => dom.window.close());
    const isSafeUrl = dom.window.eval(`${FORMATTING_SCRIPT}\ncreateFormatting().isSafeUrl;`) as (url: unknown) => boolean;

    for (const [url, isSafe] of [
      ['https://tracker.example.test/topic/42', true],
      ['http://tracker.example.test/poster.jpg', true],
      ['/api/v2.0/indexers/sample/download?url=sample', true],
      ['magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567', false],
      ['javascript:alert(1)', false],
      ['file:///sample.torrent', false],
      ['http://[', false],
      ['', false],
      [42, false],
      [null, false],
      [undefined, false],
    ] as const) {
      assert.equal(isSafeUrl(url), isSafe, String(url));
    }
  });
});
