// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSafeUrl } from '../../src/utils/url.js';

describe('resolveSafeUrl', () => {
  const baseUrl = 'https://tracker.example.org/forum/';

  it('should resolve valid relative paths against baseUrl', () => {
    assert.equal(
      resolveSafeUrl('viewtopic.php?t=12345', baseUrl),
      'https://tracker.example.org/forum/viewtopic.php?t=12345'
    );
    assert.equal(
      resolveSafeUrl('/download.php?id=999', baseUrl),
      'https://tracker.example.org/download.php?id=999'
    );
  });

  it('should preserve valid absolute http and https URLs', () => {
    assert.equal(
      resolveSafeUrl('https://tracker.example.org/details/10', baseUrl),
      'https://tracker.example.org/details/10'
    );
    assert.equal(
      resolveSafeUrl('http://insecure.example.org/item', baseUrl),
      'http://insecure.example.org/item'
    );
  });

  it('should preserve valid magnet URIs', () => {
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
    assert.equal(resolveSafeUrl(magnet, baseUrl), magnet);
  });

  it('should reject unsafe schemes like javascript:, data:, and file:', () => {
    assert.equal(resolveSafeUrl('javascript:alert(document.cookie)', baseUrl), undefined);
    assert.equal(resolveSafeUrl('data:text/html,<script>alert(1)</script>', baseUrl), undefined);
    assert.equal(resolveSafeUrl('vbscript:msgbox(1)', baseUrl), undefined);
    assert.equal(resolveSafeUrl('file:///etc/passwd', baseUrl), undefined);
  });

  it('should return undefined for empty or invalid input', () => {
    assert.equal(resolveSafeUrl('', baseUrl), undefined);
    assert.equal(resolveSafeUrl('   ', baseUrl), undefined);
    assert.equal(resolveSafeUrl(undefined, baseUrl), undefined);
  });
});
