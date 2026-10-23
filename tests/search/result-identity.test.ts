// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dedupeByReleaseGuid, getReleaseGuid } from '../../src/search/result-identity.js';
import { TorrentItem } from '../../src/types/torrent.js';

const sampleItem: TorrentItem = {
  category: 'Video',
  date: '2024-08-15',
  downloadCount: 0,
  id: '42',
  leechers: 0,
  magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
  name: 'Sample Release',
  seeders: 1,
  size: '1 GB',
  torrentUrl: 'https://tracker.example/download/42',
  url: 'https://tracker.example/details/42',
};

describe('getReleaseGuid', () => {
  it('should prefer the download link, then the magnet URI, then the details URL, as Jackett does', () => {
    assert.equal(getReleaseGuid(sampleItem), 'https://tracker.example/download/42');
    assert.equal(getReleaseGuid({ ...sampleItem, torrentUrl: '' }), sampleItem.magnetUri);
    assert.equal(getReleaseGuid({ ...sampleItem, magnetUri: undefined, torrentUrl: '' }), 'https://tracker.example/details/42');
  });

  it('should fall back to the result id when the result has no link', () => {
    assert.equal(getReleaseGuid({ ...sampleItem, magnetUri: undefined, torrentUrl: '', url: '' }), '42');
  });
});

describe('dedupeByReleaseGuid', () => {
  it('should keep the first result for each release GUID in order', () => {
    const repeatedDownload = { ...sampleItem, id: '43', url: 'https://tracker.example/details/43' };
    const otherRelease = { ...sampleItem, id: '44', torrentUrl: 'https://tracker.example/download/44' };
    const sameDetails = { ...sampleItem, id: '45', torrentUrl: 'https://tracker.example/download/45' };

    assert.deepEqual(
      dedupeByReleaseGuid([sampleItem, repeatedDownload, otherRelease, sameDetails]).map(item => item.id),
      ['42', '44', '45']
    );
  });
});
