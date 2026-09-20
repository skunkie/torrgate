// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { encodeWin1251QueryParam, HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider, resolveSafeUrl } from '../../src/providers/cardigann-provider.js';
import { CardigannDefinition } from '../../src/providers/types.js';

describe('windows-1251 Query Encoding and URL Sanitization', () => {
  describe('encodeWin1251QueryParam', () => {
    it('should keep unreserved ASCII characters unencoded', () => {
      const sample = 'Abc-123_test.release~';
      assert.equal(encodeWin1251QueryParam(sample), sample);
    });

    it('should encode spaces as plus by default or as %20 when spaceAsPlus is false', () => {
      const sample = 'Sample Search Query';
      assert.equal(encodeWin1251QueryParam(sample), 'Sample+Search+Query');
      assert.equal(encodeWin1251QueryParam(sample, false), 'Sample%20Search%20Query');
    });

    it('should encode Cyrillic characters into windows-1251 percent-encoded bytes', () => {
      const sampleCyrillic = 'Тест';
      // windows-1251: Т = 0xD2, е = 0xE5, с = 0xF1, т = 0xF2
      assert.equal(encodeWin1251QueryParam(sampleCyrillic), '%D2%E5%F1%F2');

      const sampleMixed = 'Пример Фильма 2026';
      // windows-1251: П=0xCF, р=0xF0, и=0xE8, м=0xEC, е=0xE5, р=0xF0
      // Ф=0xD4, и=0xE8, л=0xEB, ь=0xFC, м=0xEC, а=0xE0
      assert.equal(
        encodeWin1251QueryParam(sampleMixed),
        '%CF%F0%E8%EC%E5%F0+%D4%E8%EB%FC%EC%E0+2026'
      );
    });
  });

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

  describe('CardigannProvider windows-1251 Query Formatting', () => {
    it('should construct request URL with windows-1251 encoded parameters', async () => {
      let requestedUrl = '';
      const httpClient = new HttpClient();
      httpClient.getDecoded = async (url: string) => {
        requestedUrl = url;
        return '<html><body><table class="results"></table></body></html>';
      };

      const win1251Definition: CardigannDefinition = {
        encoding: 'windows-1251',
        links: ['https://win1251.example.org'],
        name: 'Win1251 Tracker',
        search: {
          fields: {},
          paths: [
            {
              inputs: {
                nm: '{{ .Keywords }}',
                o: '1',
              },
              path: 'tracker.php',
            },
          ],
          rows: {
            selector: 'table.results tr.row',
          },
        },
      };

      const provider = new CardigannProvider(win1251Definition, httpClient);
      await provider.searchByTitle({ query: 'Тест' });

      assert.ok(requestedUrl.startsWith('https://win1251.example.org/tracker.php?'));
      // In windows-1251, 'Тест' is %D2%E5%F1%F2.
      assert.ok(
        requestedUrl.includes('nm=%D2%E5%F1%F2'),
        `Expected requestedUrl to include windows-1251 encoded query, got: ${requestedUrl}`
      );
    });

    it('should honour a differently cased encoding name and let inputs replace path query parameters', async () => {
      let requestedUrl = '';
      const httpClient = new HttpClient();
      httpClient.getDecoded = async (url: string) => {
        requestedUrl = url;
        return '<html><body><table class="results"></table></body></html>';
      };

      const win1251Definition: CardigannDefinition = {
        encoding: 'Windows-1251',
        links: ['https://win1251.example.org'],
        name: 'Win1251 Tracker',
        search: {
          fields: {},
          paths: [
            {
              inputs: {
                s: '{{ .Keywords }}',
              },
              path: 'browse.php?s=placeholder&v=0',
            },
          ],
          rows: {
            selector: 'table.results tr.row',
          },
        },
      };

      const provider = new CardigannProvider(win1251Definition, httpClient);
      await provider.searchByTitle({ query: 'Тест' });

      const params = requestedUrl.slice(requestedUrl.indexOf('?') + 1).split('&');
      assert.deepEqual(params, ['v=0', 's=%D2%E5%F1%F2']);
    });
  });
});
