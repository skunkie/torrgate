// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getSupportedCategoryIds } from '../../../src/jackett/categories/mapping.js';
import { renderTorznabCaps } from '../../../src/jackett/torznab/caps-xml.js';
import { renderTorznabIndexers } from '../../../src/jackett/torznab/indexers.js';
import { escapeXml, isTorznabPath, renderTorznabError, renderTorznabFeed, TORZNAB_ERROR_CODES } from '../../../src/jackett/torznab/xml.js';
import { TorrentItem } from '../../../src/types/torrent.js';

describe('Torznab XML Serializer', () => {
  it('should render Torznab <caps> XML with the standard categories the tracker uses', () => {
    const mappings = [
      { cat: 'Movies', desc: 'Sample Films', id: 1 },
      { cat: 'TV/Anime', desc: 'Sample Animation', id: 5 },
    ];

    const xml = renderTorznabCaps(mappings, { shouldIncludeTrackerCategories: true });
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<caps>/);
    assert.match(xml, /<server title="TorrGate" \/>/);
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

  it('should order custom caps categories by name after standard categories', () => {
    const xml = renderTorznabCaps([
      { cat: 'Movies', desc: 'Zulu Sample', id: 1 },
      { cat: 'TV/HD', desc: 'Alpha Sample', id: 2 },
    ], { shouldIncludeTrackerCategories: true });
    assert.deepEqual([...xml.matchAll(/<category id="(\d+)"/g)].map(match => Number(match[1])), [2000, 5000, 100002, 100001]);
  });

  it('should retain the first category label when a custom ID collides with a standard ID', () => {
    const xml = renderTorznabCaps([
      { cat: 'Movies', desc: 'Sample Custom Parent', id: -95000 },
      { cat: 'Movies', desc: 'Sample Custom Child', id: -94960 },
      { cat: 'TV/HD', id: 2 },
    ], { shouldIncludeTrackerCategories: true });
    assert.match(xml, /<category id="5000" name="Sample Custom Parent">\s*<subcat id="5040" name="Sample Custom Child" \/>\s*<\/category>/);
  });

  it('should advertise exactly the category IDs used for admission', () => {
    const mappings = [
      { cat: 'Movies', id: 1 },
      { cat: 'TV/HD', desc: 'Sample Section', id: 'sample-section' },
      { cat: 'TV', desc: '', id: 2 },
      { cat: 'Audio', desc: 'Sample Negative', id: -1 },
      { cat: 'Books', desc: 'Sample Maximum', id: 2147483647 },
    ];
    for (const shouldIncludeTrackerCategories of [false, true]) {
      const xml = renderTorznabCaps(mappings, { shouldIncludeTrackerCategories });
      const ids = [...xml.matchAll(/<(?:category|subcat) id="(-?\d+)"/g)].map(match => Number(match[1]));
      assert.deepEqual(new Set(ids), getSupportedCategoryIds(mappings, shouldIncludeTrackerCategories));
    }
    const xml = renderTorznabCaps(mappings, { shouldIncludeTrackerCategories: true });
    assert.match(xml, /<category id="111064" name="Sample Section" \/>/);
    assert.match(xml, /<category id="100002" name="" \/>/);
    assert.doesNotMatch(xml, /id="100001"/);
  });

  it('should render every Jackett search mode with its availability and supported parameters', () => {
    const xml = renderTorznabCaps([{ cat: 'Movies', id: 1 }], {
      searchCaps: {
        modes: {
          'movie-search': ['q', 'imdbid', 'year'],
          'search': ['q'],
          'tv-search': ['q', 'season', 'ep', 'year'],
        },
        supportsRawSearch: false,
        supportsTvImdbSearch: true,
      },
    });
    assert.match(xml, /<limits default="100" max="100" \/>/);
    assert.match(xml, /<search available="yes" supportedParams="q" \/>/);
    assert.match(xml, /<tv-search available="yes" supportedParams="q,season,ep,imdbid,year" \/>/);
    assert.match(xml, /<movie-search available="yes" supportedParams="q,imdbid,year" \/>/);
    assert.match(xml, /<music-search available="no" supportedParams="q" \/>/);
    assert.match(xml, /<audio-search available="no" supportedParams="q" \/>/);
    assert.match(xml, /<book-search available="no" supportedParams="q" \/>/);
  });

  it('should mark modes available and raw search from the indexer caps', () => {
    const xml = renderTorznabCaps([{ cat: 'Audio', id: 1 }], {
      resultLimit: 1000,
      searchCaps: {
        modes: { 'book-search': ['q'], 'music-search': ['q', 'artist'], 'search': ['q'] },
        supportsRawSearch: true,
        supportsTvImdbSearch: false,
      },
    });
    assert.match(xml, /<limits default="1000" max="1000" \/>/);
    assert.match(xml, /<search available="yes" supportedParams="q" searchEngine="raw" \/>/);
    assert.match(xml, /<tv-search available="no" supportedParams="q" searchEngine="raw" \/>/);
    assert.match(xml, /<music-search available="yes" supportedParams="q,artist" searchEngine="raw" \/>/);
    assert.match(xml, /<audio-search available="yes" supportedParams="q,artist" searchEngine="raw" \/>/);
    assert.match(xml, /<book-search available="yes" supportedParams="q" searchEngine="raw" \/>/);
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
      { channelDescription: 'Sample tracker description', channelLink: 'https://rutor.info/', channelTitle: 'RuTor' }
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
      { apiKey: 'my-api-key', channelDescription: '', channelLink: 'https://rutor.info/', channelTitle: 'RuTor', origin: 'http://127.0.0.1:3000' }
    );
    assert.match(xml, /<enclosure url="http:\/\/127\.0\.0\.1:3000\/api\/v2\.0\/indexers\/rutor\/download\?url=[^"]*&amp;jackett_apikey=my-api-key" length="1288490188" type="application\/x-bittorrent" \/>/);
    assert.match(xml, /<link>http:\/\/127\.0\.0\.1:3000\/api\/v2\.0\/indexers\/rutor\/download\?url=[^"]*&amp;jackett_apikey=my-api-key<\/link>/);
  });
});

describe('Torznab feed layout', () => {
  it('should lay out the channel and items in the element order of Jackett feeds', () => {
    const fullItem: TorrentItem = {
      album: 'Sample Album',
      artist: 'Test Artist',
      author: 'Sample Author',
      bookTitle: 'Sample Book',
      category: '1',
      date: '2024-08-15T12:00:00Z',
      description: 'Sample description',
      doubanId: 8,
      downloadCount: 0,
      downloadVolumeFactor: 0,
      files: 3,
      genres: ['Drama', 'Sample Genre'],
      id: '1',
      imdbId: 'tt0123456',
      label: 'Sample Label',
      leechers: 2,
      magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      minimumRatio: 1,
      minimumSeedTimeSeconds: 172800,
      name: 'Sample Release',
      publisher: 'Sample Publisher',
      rageId: 2,
      seeders: 5,
      size: '1 GB',
      sizeBytes: 1073741824,
      tmdbId: 4,
      torrentUrl: 'https://tracker.example/download/1',
      track: 'Sample Track',
      traktId: 7,
      tvdbId: 3,
      tvmazeId: 6,
      uploadVolumeFactor: 1,
      url: 'https://tracker.example/details/1',
      year: 2024,
    };
    const magnetItem: TorrentItem = {
      category: '1',
      date: '2024-08-15T12:00:00Z',
      id: '2',
      leechers: 0,
      magnetUri: 'magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef',
      name: 'Sample Magnet Release',
      seeders: 1,
      size: '2 GB',
      sizeBytes: 2147483648,
      torrentUrl: '',
      url: '',
    };
    const mappings = [{ cat: 'Movies', id: 1 }];

    const xml = renderTorznabFeed(
      [fullItem, magnetItem].map(item => ({ item, mappings, trackerId: 'sample', trackerName: 'Sample Tracker', trackerType: 'public' })),
      { channelDescription: 'Sample tracker description', channelLink: 'https://tracker.example/', channelTitle: 'Sample Tracker', origin: 'https://gateway.example.test' }
    );

    assert.equal(xml, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <atom:link href="https://gateway.example.test/" rel="self" type="application/rss+xml" />
    <title>Sample Tracker</title>
    <description>Sample tracker description</description>
    <link>https://tracker.example/</link>
    <language>en-US</language>
    <category>search</category>
    <item>
      <title>Sample Release</title>
      <guid>https://tracker.example/download/1</guid>
      <jackettindexer id="sample">Sample Tracker</jackettindexer>
      <type>public</type>
      <comments>https://tracker.example/details/1</comments>
      <pubDate>Thu, 15 Aug 2024 12:00:00 +0000</pubDate>
      <size>1073741824</size>
      <files>3</files>
      <grabs>0</grabs>
      <description>Sample description</description>
      <link>https://gateway.example.test/api/v2.0/indexers/sample/download?url=https%3A%2F%2Ftracker.example%2Fdownload%2F1</link>
      <category>2000</category>
      <enclosure url="https://gateway.example.test/api/v2.0/indexers/sample/download?url=https%3A%2F%2Ftracker.example%2Fdownload%2F1" length="1073741824" type="application/x-bittorrent" />
      <torznab:attr name="category" value="2000" />
      <torznab:attr name="rageid" value="2" />
      <torznab:attr name="tvdbid" value="3" />
      <torznab:attr name="imdb" value="0123456" />
      <torznab:attr name="imdbid" value="tt0123456" />
      <torznab:attr name="tmdbid" value="4" />
      <torznab:attr name="tvmazeid" value="6" />
      <torznab:attr name="traktid" value="7" />
      <torznab:attr name="doubanid" value="8" />
      <torznab:attr name="genre" value="Drama, Sample Genre" />
      <torznab:attr name="year" value="2024" />
      <torznab:attr name="author" value="Sample Author" />
      <torznab:attr name="booktitle" value="Sample Book" />
      <torznab:attr name="publisher" value="Sample Publisher" />
      <torznab:attr name="artist" value="Test Artist" />
      <torznab:attr name="album" value="Sample Album" />
      <torznab:attr name="label" value="Sample Label" />
      <torznab:attr name="track" value="Sample Track" />
      <torznab:attr name="seeders" value="5" />
      <torznab:attr name="peers" value="7" />
      <torznab:attr name="infohash" value="0123456789abcdef0123456789abcdef01234567" />
      <torznab:attr name="magneturl" value="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567" />
      <torznab:attr name="minimumratio" value="1" />
      <torznab:attr name="minimumseedtime" value="172800" />
      <torznab:attr name="downloadvolumefactor" value="0" />
      <torznab:attr name="uploadvolumefactor" value="1" />
    </item>
    <item>
      <title>Sample Magnet Release</title>
      <guid>magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef</guid>
      <jackettindexer id="sample">Sample Tracker</jackettindexer>
      <type>public</type>
      <pubDate>Thu, 15 Aug 2024 12:00:00 +0000</pubDate>
      <size>2147483648</size>
      <description />
      <link>magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef</link>
      <category>2000</category>
      <enclosure url="magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef" length="2147483648" type="application/x-bittorrent" />
      <torznab:attr name="category" value="2000" />
      <torznab:attr name="seeders" value="1" />
      <torznab:attr name="peers" value="1" />
      <torznab:attr name="infohash" value="89abcdef0123456789abcdef0123456789abcdef" />
      <torznab:attr name="magneturl" value="magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef" />
    </item>
  </channel>
</rss>`);
  });
});

describe('Torznab feed channel', () => {
  it('should render a missing indexer description as an empty element and keep an empty one', () => {
    const channel = { channelLink: 'https://tracker.example/', channelTitle: 'Sample Tracker', origin: 'https://gateway.example.test' };
    assert.ok(renderTorznabFeed([], channel).includes('<title>Sample Tracker</title>\n    <description />\n'));
    assert.ok(renderTorznabFeed([], { ...channel, channelDescription: '' }).includes('<description></description>'));
  });
});

describe('Torznab feed links', () => {
  it('should derive a hash from the magnet when the supplied hash is only whitespace', () => {
    const xml = renderTorznabFeed([{
      item: {
        category: '', date: '2024-01-01', id: 'sample', infoHash: ' ',
        magnetUri: 'magnet:?xt=urn:btih:ActualHash', name: 'Sample Release', size: '', torrentUrl: '', url: '',
      },
      mappings: [],
      trackerId: 'sample',
      trackerName: 'Sample Tracker',
      trackerType: 'public',
    }], { channelLink: 'https://tracker.example.test/', channelTitle: 'Sample Tracker' });
    assert.match(xml, /<torznab:attr name="infohash" value="ActualHash" \/>/);
  });

  it('should leave the link and enclosure empty for a release with only a details page, as Jackett does', () => {
    const detailsOnly: TorrentItem = {
      category: '1',
      date: '2024-08-15T12:00:00Z',
      downloadCount: 0,
      id: '3',
      leechers: 0,
      name: 'Sample Details Release',
      seeders: 1,
      size: '1 GB',
      sizeBytes: 1073741824,
      torrentUrl: '',
      url: 'https://tracker.example/details/3',
    };

    const xml = renderTorznabFeed(
      [{ item: detailsOnly, mappings: [{ cat: 'Movies', id: 1 }], trackerId: 'sample', trackerName: 'Sample Tracker', trackerType: 'public' }],
      { channelDescription: '', channelLink: 'https://tracker.example/', channelTitle: 'Sample Tracker', origin: 'https://gateway.example.test' }
    );

    assert.ok(xml.includes('<guid>https://tracker.example/details/3</guid>'));
    assert.ok(xml.includes('<link></link>'));
    assert.ok(xml.includes('<enclosure url="" length="1073741824" type="application/x-bittorrent" />'));
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

describe('Torznab indexer discovery XML', () => {
  it('should distinguish empty metadata strings from missing metadata', () => {
    const xml = renderTorznabIndexers([{
      description: '',
      id: 'sample',
      isConfigured: true,
      link: '',
      mappings: [],
      title: 'Sample Tracker',
      type: 'public',
    }]);
    assert.ok(xml.includes('<description></description>'));
    assert.ok(xml.includes('<link></link>'));
    assert.ok(xml.includes('<language />'));
  });

  it('should advertise an empty category set when no indexer maps a category', () => {
    assert.equal(renderTorznabCaps([]), `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="TorrGate" />
  <limits default="100" max="100" />
  <searching>
    <search available="yes" supportedParams="q" />
    <tv-search available="no" supportedParams="q" />
    <movie-search available="no" supportedParams="q" />
    <music-search available="no" supportedParams="q" />
    <audio-search available="no" supportedParams="q" />
    <book-search available="no" supportedParams="q" />
  </searching>
  <categories />
</caps>`);
  });

  it('should render the complete metadata wrapper and embed caps in declaration order', () => {
    const xml = renderTorznabIndexers([{
      description: 'Sample & description',
      id: 'sample',
      isConfigured: false,
      link: 'https://tracker.example/',
      mappings: [{ cat: 'Movies', desc: 'Sample Films', id: 1 }],
      title: 'Sample <Tracker>',
      type: 'private',
    }]);
    assert.equal(xml, `<?xml version="1.0" encoding="UTF-8"?>
<indexers>
  <indexer id="sample" configured="false">
    <title>Sample &lt;Tracker&gt;</title>
    <description>Sample &amp; description</description>
    <link>https://tracker.example/</link>
    <language />
    <type>private</type>
    <caps>
      <server title="TorrGate" />
      <limits default="100" max="100" />
      <searching>
        <search available="yes" supportedParams="q" />
        <tv-search available="no" supportedParams="q" />
        <movie-search available="no" supportedParams="q" />
        <music-search available="no" supportedParams="q" />
        <audio-search available="no" supportedParams="q" />
        <book-search available="no" supportedParams="q" />
      </searching>
      <categories>
        <category id="2000" name="Movies" />
        <category id="100001" name="Sample Films" />
      </categories>
    </caps>
  </indexer>
</indexers>`);
  });
});
