// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TorrentItem } from '../../src/types/torrent.js';
import {
  escapeXml,
  isTorznabPath,
  renderTorznabCaps,
  renderTorznabError,
  renderTorznabFeed,
  TORZNAB_ERROR_CODES,
} from '../../src/utils/torznab-xml.js';

describe('Torznab XML Serializer', () => {
  it('should render Torznab <caps> XML with the standard categories the tracker uses', () => {
    const mappings = [
      { cat: 'Movies', desc: 'Sample Films', id: 1 },
      { cat: 'TV/Anime', desc: 'Sample Animation', id: 5 },
    ];

    const xml = renderTorznabCaps(mappings, { includeTrackerCategories: true });
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<caps>/);
    assert.match(xml, /<server version="1\.0" title="TorrGate" \/>/);
    assert.match(xml, /<category id="2000" name="Movies" \/>/);
    assert.match(xml, /<category id="5000" name="TV">\s*<subcat id="5070" name="TV\/Anime" \/>\s*<\/category>/);
    assert.match(xml, /<category id="100001" name="Sample Films" \/>/);
    assert.match(xml, /<category id="100005" name="Sample Animation" \/>/);
    assert.doesNotMatch(xml, /id="3000"/);
  });

  it('should omit tracker-specific categories when not requested', () => {
    const xml = renderTorznabCaps([{ cat: 'Movies', id: 1 }]);
    assert.doesNotMatch(xml, /100001/);
  });

  it('should strip characters that XML 1.0 cannot represent', () => {
    assert.equal(escapeXml('Example\u0001 Release\u000B & <Test>'), 'Example Release &amp; &lt;Test&gt;');
  });

  it('should render Torznab RSS 2.0 XML with items and torznab attributes', () => {
    const items: TorrentItem[] = [
      {
        category: 'Movies',
        date: '2024-08-15T12:00:00Z',
        downloadCount: 10,
        id: '300001',
        leechers: 15,
        magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef&dn=test',
        name: 'Example Release (2024) BDRip',
        seeders: 320,
        size: '2.18 GB',
        sizeBytes: 2341011456,
        torrentUrl: 'https://d.rutor.info/download/300001',
        url: 'https://rutor.info/torrent/300001',
      },
    ];

    const xml = renderTorznabFeed(
      items.map(item => ({ item, mappings: [], trackerId: 'rutor', trackerName: 'RuTor', trackerType: 'public' })),
      { channelId: 'rutor', channelTitle: 'RuTor' }
    );
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:torznab="http:\/\/torznab\.com\/schemas\/2015\/feed">/);
    assert.match(xml, /<title>Example Release \(2024\) BDRip<\/title>/);
    assert.match(xml, /<jackettindexer id="rutor">RuTor<\/jackettindexer>/);
    assert.match(xml, /<type>public<\/type>/);
    assert.match(xml, /<size>2341011456<\/size>/);
    assert.match(xml, /<enclosure url="[^"]*\/api\/v2\.0\/indexers\/rutor\/download\?url=[^"]*" length="2341011456" type="application\/x-bittorrent" \/>/);
    assert.match(xml, /<torznab:attr name="seeders" value="320" \/>/);
    assert.match(xml, /<torznab:attr name="peers" value="335" \/>/);
    assert.match(xml, /<torznab:attr name="magneturl" value="magnet:\?xt=urn:btih:0123456789abcdef&amp;dn=test" \/>/);
  });

  it('should include jackett_apikey in enclosure URL and link when apiKey is provided', () => {
    const items: TorrentItem[] = [
      {
        category: 'Movies',
        date: '2024-08-15T12:00:00Z',
        downloadCount: 5,
        id: '300002',
        leechers: 2,
        name: 'Example Release (2024)',
        seeders: 50,
        size: '1.2 GB',
        sizeBytes: 1288490188,
        torrentUrl: 'https://d.rutor.info/download/300002',
        url: 'https://rutor.info/torrent/300002',
      },
    ];

    const xml = renderTorznabFeed(
      items.map(item => ({ item, mappings: [], trackerId: 'rutor', trackerName: 'RuTor', trackerType: 'public' })),
      { apiKey: 'my-api-key', channelId: 'rutor', channelTitle: 'RuTor', origin: 'http://127.0.0.1:3000' }
    );
    assert.match(xml, /<enclosure url="http:\/\/127\.0\.0\.1:3000\/api\/v2\.0\/indexers\/rutor\/download\?url=[^"]*&amp;jackett_apikey=my-api-key" length="1288490188" type="application\/x-bittorrent" \/>/);
    assert.match(xml, /<link>http:\/\/127\.0\.0\.1:3000\/api\/v2\.0\/indexers\/rutor\/download\?url=[^"]*&amp;jackett_apikey=my-api-key<\/link>/);
  });
});

describe('Torznab errors and paths', () => {
  it('should render a Torznab error document with an escaped description', () => {
    assert.equal(
      renderTorznabError(TORZNAB_ERROR_CODES.unknownError, 'Sample <failure> & "detail"'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<error code="900" description="Sample &lt;failure&gt; &amp; &quot;detail&quot;" />'
    );
  });

  it('should recognize Torznab endpoint paths only', () => {
    assert.equal(isTorznabPath('/rutor/results/torznab/api'), true);
    assert.equal(isTorznabPath('/all/results/torznab'), true);
    assert.equal(isTorznabPath('/rutor/results'), false);
    assert.equal(isTorznabPath('/rutor/download'), false);
  });
});
