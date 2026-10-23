// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toJackettSearchResponse } from '../../src/jackett/manual-search-results.js';
import { TrackerProvider } from '../../src/types/provider.js';
import { TorrentItem } from '../../src/types/torrent.js';

const STUB_PROVIDER: TrackerProvider = {
  checkAvailability: async () => ({ isAvailable: true, name: 'Sample Tracker' }),
  downloadTorrent: async () => ({ data: Buffer.alloc(0), fileName: 'sample.torrent' }),
  getTopicDetails: async () => null,
  id: 'sample',
  name: 'Sample Tracker',
  searchByTitle: async () => [],
  urls: ['https://tracker.example.test/'],
};

describe('Jackett JSON download links', () => {
  for (const origin of ['', 'https://gateway.example.test']) {
    for (const torrentUrl of ['', 'https://tracker.example.test/download/42?name=Sample Release&token=sample']) {
      for (const apiKey of [undefined, 'sample key&value']) {
        it(`should serialize ${torrentUrl ? 'a download link' : 'a null link'} with ${origin ? 'a configured origin' : 'no origin'} and ${apiKey ? 'an API key' : 'no API key'}`, () => {
          const item: TorrentItem = {
            category: '',
            date: '',
            id: '42',
            name: 'Sample Release',
            size: '',
            torrentUrl,
            url: 'https://tracker.example.test/topic/42',
          };
          const response = toJackettSearchResponse([
            { elapsedTimeMs: 0, error: null, items: [item], provider: STUB_PROVIDER },
          ], origin, apiKey);
          const link = response.Results[0].Link;

          if (!torrentUrl) {
            assert.equal(link, null);
            return;
          }
          assert.ok(link);
          if (origin) assert.equal(new URL(link).origin, origin);
          else assert.ok(link.startsWith('/api/v2.0/indexers/'));
          const parsed = new URL(link, 'https://gateway.example.test');
          assert.equal(parsed.pathname, '/api/v2.0/indexers/sample/download');
          assert.equal(parsed.searchParams.get('url'), torrentUrl);
          assert.equal(parsed.searchParams.get('jackett_apikey'), apiKey ?? null);
        });
      }
    }
  }
});
