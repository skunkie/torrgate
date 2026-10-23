// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { load } from 'cheerio';

import { BASIC_SEARCH_CAPS, TorznabSearchCaps } from '../../../src/jackett/torznab/caps.js';
import { parseSearchResults } from '../../../src/providers/cardigann/search-results.js';
import { CardigannDefinition, CardigannField } from '../../../src/providers/cardigann/types.js';
import { SearchOptions } from '../../../src/types/provider.js';

describe('Cardigann search result extraction', () => {
  const definition: CardigannDefinition = {
    caps: {
      categorymappings: [{ cat: 'Movies', id: 1 }, { cat: 'TV', id: 2 }],
    },
    links: ['https://tracker.example.test/'],
    name: 'Sample Tracker',
    search: {
      fields: {
        category: { attribute: 'data-category' },
        details: { attribute: 'href', selector: 'a' },
        download: {
          filters: [{ args: ['topic/', 'download/'], name: 'replace' }],
          text: '{{ .Result.details }}',
        },
        seeders: { selector: '.seeders' },
        size: { selector: '.size' },
        title: { selector: 'a' },
      },
      paths: [{ path: 'search' }],
      rows: { selector: '.result' },
    },
  };
  const testHtml = `
    <div class="result" data-category="1">
      <a href="topic/101">Пример Фильма 1080p</a>
      <span class="seeders">1,234</span><span class="size">2 GB</span>
    </div>
    <div class="result" data-category="2">
      <a href="topic/102">Sample Show 720p</a>
      <span class="seeders">0</span><span class="size">512 MB</span>
    </div>`;

  it('should resolve dependent fields and normalize results before filtering', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition,
      options: { categories: [2000], format: 1080, query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/search/',
    });

    assert.equal(page.length, 1);
    assert.equal(page[0].name, 'Пример Фильма 1080p');
    assert.equal(page[0].seeders, 1234);
    assert.equal(page[0].sizeBytes, 2 * 1024 ** 3);
    assert.equal(page[0].url, 'https://tracker.example.test/search/topic/101');
    assert.equal(page[0].torrentUrl, 'https://tracker.example.test/search/download/101');
  });

  it('should preserve absent seeders and leechers and distinguish explicit zero counts', () => {
    const fieldSets: Record<string, CardigannField>[] = [
      { title: { text: 'Sample Release' } },
      { leechers: { optional: true, selector: '.missing' }, seeders: { optional: true, text: ' ' }, title: { text: 'Sample Release' } },
      { leechers: { text: '0' }, seeders: { text: '0' }, title: { text: 'Sample Release' } },
    ];
    for (const fields of fieldSets) {
      const items = parseSearchResults(load('<div class="result"></div>'), {
        context: {},
        definition: { ...definition, search: { ...definition.search, fields } },
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      });
      const expected = fields.seeders?.text === '0' ? 0 : undefined;
      assert.deepEqual(items.map(item => [item.seeders, item.leechers]), [[expected, expected]]);
    }
  });

  it('should remove descendant elements before extraction and retain the mutated row for later fields', () => {
    const items = parseSearchResults(load('<div class="result"><a>Sample Release<span class="badge"> Promotion</span></a></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([
            ['title', { remove: '.badge', selector: 'a' }],
            ['badge|optional', { default: 'Removed', selector: '.badge' }],
            ['description', { text: '{{ .Result.badge }}' }],
          ]),
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(items.map(item => [item.name, item.description]), [['Sample Release', 'Removed']]);
  });

  it('should append title and description text, expose accumulated values, and apply optional defaults by base field name', () => {
    const items = parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([
            ['title', { text: 'Sample' }],
            ['title|append', { text: ' Release' }],
            ['description', { text: 'Notes: ' }],
            ['description|append', { text: '{{ .Result.title }}' }],
            ['description|append|optional', { selector: '.missing' }],
            ['author', { text: '{{ .Result.description }}' }],
            ['booktitle', { text: '{{ .Result.title }}' }],
            ['size|optional', { default: '1 GB', selector: '.missing' }],
            ['seeders|optional', { text: '0' }],
          ]),
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(items.map(item => [item.name, item.description, item.bookTitle, item.author, item.sizeBytes, item.seeders]), [
      ['Sample Release', 'Notes: Sample Release', 'Sample Release', '', 1024 ** 3, 0],
    ]);
  });

  it('should use the original field key for Jackett always-optional fields and honor explicit optional modifiers', () => {
    const parseTitles = (field: string): string[] => parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([['title', { text: 'Sample Release' }], [field, { selector: '.missing' }]]),
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    }).map(item => item.name);
    assert.deepEqual(parseTitles('description'), ['Sample Release']);
    assert.deepEqual(parseTitles('description|append'), []);
    assert.deepEqual(parseTitles('description|append|optional'), ['Sample Release']);
  });

  it('should accumulate repeated peers and genres and expose parsed result values', () => {
    const items = parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([
            ['category', { text: '1' }],
            ['seeders', { text: '1,234' }],
            ['seeders|optional', { text: '2' }],
            ['leechers', { text: '3' }],
            ['genre', { text: 'Sample_Genre/Drama' }],
            ['genre|optional', { text: 'Drama/Another_Genre' }],
            ['description', { text: '{{ .Result.seeders }}:{{ .Result.genre }}:{{ .Result.category }}' }],
            ['title', { text: 'Sample Release' }],
          ]),
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(items.map(item => [item.seeders, item.leechers, item.genres, item.description]), [
      [2, 1237, ['Sample Genre', 'Drama', 'Another Genre'], '2:Sample Genre,Drama,Another Genre:System.Collections.Generic.List`1[System.Int32]'],
    ]);
  });

  it('should apply Jackett peer-count bounds before accumulating peers', () => {
    const items = parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: { leechers: { text: '5,000,000' }, seeders: { text: '4,999,999' }, title: { text: 'Sample Release' } },
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(items.map(item => [item.seeders, item.leechers]), [[4_999_999, 0]]);
  });

  it('should skip invalid required selectors and retain rows with invalid optional selectors', () => {
    for (const isOptional of [false, true]) {
      const items = parseSearchResults(load('<div class="result"></div>'), {
        context: {},
        definition: {
          ...definition,
          search: {
            ...definition.search,
            fields: { size: { optional: isOptional, selector: '[' }, title: { text: 'Sample Release' } },
          },
        },
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      });
      assert.equal(items.length, isOptional ? 1 : 0);
    }
  });

  it('should skip an optional field whose default template fails while retaining the row', () => {
    const items = parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([
            ['description', { text: 'Sample description' }],
            ['description|append|optional', { default: '{{ if .Config.missing }}', selector: '.missing' }],
            ['title', { text: 'Sample Release {{ .Result.description }}' }],
          ]),
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].description, 'Sample description');
    assert.equal(items[0].name, 'Sample Release ');
  });

  it('should map category descriptions across all matching tracker IDs', () => {
    const parse = (description: string) => parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        caps: { categorymappings: [
          { cat: 'Movies', desc: 'Sample Shared', id: 1 },
          { cat: 'TV', desc: 'Sample Shared', id: 2 },
        ] },
        search: {
          ...definition.search,
          fields: { categorydesc: { text: description }, title: { text: 'Sample Release' } },
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(parse('sample shared')[0].categories, [2000, 100001, 5000, 100002]);
    assert.deepEqual(parse('1')[0].categories, []);
  });

  it('should leave blank category descriptions unmapped even when a mapping description is blank', () => {
    for (const description of ['', ' ']) {
      const items = parseSearchResults(load('<div class="result"></div>'), {
        context: {},
        definition: {
          ...definition,
          caps: { categorymappings: [{ cat: 'Movies', desc: description, id: 1 }] },
          search: { ...definition.search, fields: { categorydesc: { text: description }, title: { text: 'Sample Release' } } },
        },
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      });
      assert.deepEqual(items[0].categories, []);
    }
  });

  it('should union category fields and replace them only when noappend maps a category', () => {
    const parse = (replace: boolean, categories: number[] = []) => parseSearchResults(load('<div class="result"></div>'), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: Object.fromEntries([
            ['category', { text: '1' }],
            ['category|optional', { text: '2' }],
            ['category|noappend', { text: replace ? '2' : '999' }],
            ['size', { text: '1 GB' }],
            ['title', { text: 'Sample Release' }],
          ]),
        },
      },
      options: { categories, query: '', shouldDropIncompleteReleases: true },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(parse(false).map(item => item.categories), [[2000, 5000]]);
    assert.deepEqual(parse(true).map(item => item.categories), [[5000]]);
    assert.equal(parse(false, [2000]).length, 1);
    assert.deepEqual(parse(true, [2000]), []);
    assert.equal(parse(true, [5000]).length, 1);
  });

  it('should retain declared descriptions and resolve only HTTP poster URLs', () => {
    const testHtml = `<div class="result"><a>Пример Релиза</a><p class="summary">Тестовое описание &amp; sample notes</p><img src="../posters/sample.jpg"></div>
      <div class="result"><a>Sample Release</a><img src="javascript:alert(1)"></div>
      <div class="result"><a>Another Sample Release</a><img src="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"></div>`;
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: {
            description: { selector: '.summary' },
            poster: { attribute: 'src', selector: 'img' },
            title: { selector: 'a' },
          },
        },
      },
      options: { query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/search/page',
    });
    assert.equal(page[0].description, 'Тестовое описание & sample notes');
    assert.equal(page[0].posterUrl, 'https://tracker.example.test/posters/sample.jpg');
    assert.equal(page[1].description, undefined);
    assert.equal(page[1].posterUrl, undefined);
    assert.equal(page[2].posterUrl, undefined);
  });

  it('should apply category filters to releases with the Jackett category information setting', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: {
        ...definition,
        caps: { categorymappings: [{ cat: 'Other/Misc', id: 169 }] },
        search: { ...definition.search, fields: { ...definition.search.fields, category: { text: 169 } } },
        settings: [{ name: 'category-information', type: 'info_category_8000' }],
      },
      options: { categories: [2000], format: 1080, query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/search/',
    });

    assert.deepEqual(page, []);
  });

  it('should apply andmatch row filters using processed keywords and ignore common words', () => {
    const page = parseSearchResults(load(testHtml), {
      context: { Keywords: 'the Sample and Show' },
      definition: { ...definition, search: { ...definition.search, rows: { filters: [{ name: 'andmatch' }], selector: '.result' } } },
      options: { query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.name), ['Sample Show 720p']);
  });

  it('should match the search term and episode tag when keyword filters leave the keywords blank', () => {
    const page = parseSearchResults(load(testHtml), {
      context: { Keywords: ' ', Query: { Episode: '720p', Q: 'Sample' } },
      definition: { ...definition, search: { ...definition.search, rows: { filters: [{ name: 'andmatch' }], selector: '.result' } } },
      options: { query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.name), ['Sample Show 720p']);
  });

  it('should skip andmatch for id searches the indexer caps support, as Jackett does', () => {
    const andMatchDefinition = { ...definition, search: { ...definition.search, rows: { filters: [{ name: 'andmatch' }], selector: '.result' } } };
    const movieImdbCaps = { modes: { 'movie-search': ['q', 'imdbid'] }, supportsRawSearch: false, supportsTvImdbSearch: false };
    const tvImdbCaps = { modes: { 'tv-search': ['q', 'tvdbid', 'tmdbid'] }, supportsRawSearch: false, supportsTvImdbSearch: true };
    const parse = (options: SearchOptions, searchCaps: TorznabSearchCaps): string[] =>
      parseSearchResults(load(testHtml), {
        context: { Keywords: 'S01E02' },
        definition: andMatchDefinition,
        options,
        searchCaps,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      }).map(item => item.name);
    const allItems = ['Пример Фильма 1080p', 'Sample Show 720p'];

    const movieIdOptions: Omit<SearchOptions, 'query'>[] = [{ imdbId: 'tt0123456' }, { doubanId: 1 }, { traktId: 1 }];
    for (const options of movieIdOptions) {
      assert.deepEqual(parse({ ...options, query: '' }, movieImdbCaps), allItems, JSON.stringify(options));
      assert.deepEqual(parse({ ...options, query: '' }, BASIC_SEARCH_CAPS), [], JSON.stringify(options));
    }
    const tvIdOptions: Omit<SearchOptions, 'query'>[] = [{ tmdbId: 1 }, { tvdbId: 1 }, { tvmazeId: 1 }, { rageId: 1 }];
    for (const options of tvIdOptions) {
      assert.deepEqual(parse({ ...options, query: '' }, tvImdbCaps), allItems, JSON.stringify(options));
      assert.deepEqual(parse({ ...options, query: '' }, movieImdbCaps), [], JSON.stringify(options));
    }
  });

  const withSizeField = (size: CardigannField | undefined): CardigannDefinition => {
    const { size: _size, ...fields } = definition.search.fields;
    return { ...definition, search: { ...definition.search, fields: size ? { ...fields, size } : fields } };
  };

  it('should leave a release unsized when its size field is absent or an optional size is blank, and skip rows missing a required size', () => {
    const parseSizes = (size: CardigannField | undefined, sizeMarkup = ''): (number | undefined)[] =>
      parseSearchResults(load(testHtml.replace(/<span class="size">[^<]*<\/span>/g, sizeMarkup)), {
        context: {},
        definition: withSizeField(size),
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      }).map(item => item.sizeBytes);

    assert.deepEqual(parseSizes(undefined), [undefined, undefined]);
    assert.deepEqual(parseSizes({ optional: true, selector: '.size' }), [undefined, undefined]);
    assert.deepEqual(parseSizes({ optional: true, selector: '.size' }, '<span class="size"> </span>'), [undefined, undefined]);
    assert.deepEqual(parseSizes({ default: '1 KB', optional: true, selector: '.size' }), [1024, 1024]);
    assert.deepEqual(parseSizes({ selector: '.size' }, '<span class="size"></span>'), [0, 0]);
    assert.deepEqual(parseSizes({ selector: '.size' }), []);
  });

  it('should drop releases without a size or a category only when asked to, as Jackett does outside interactive searches', () => {
    const incompleteHtml = `${testHtml}
      <div class="result" data-category="9"><a href="topic/103">Sample Unmapped Release</a><span class="seeders">1</span><span class="size">1 GB</span></div>`;
    const parseTitles = (shouldDropIncompleteReleases: boolean, size?: CardigannField): string[] =>
      parseSearchResults(load(incompleteHtml), {
        context: {},
        definition: withSizeField(size),
        options: { query: '', shouldDropIncompleteReleases },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      }).map(item => item.name);

    const allTitles = ['Пример Фильма 1080p', 'Sample Show 720p', 'Sample Unmapped Release'];
    assert.deepEqual(parseTitles(false, definition.search.fields.size), allTitles);
    assert.deepEqual(parseTitles(true, definition.search.fields.size), allTitles.slice(0, 2));
    assert.deepEqual(parseTitles(false), allTitles);
    assert.deepEqual(parseTitles(true), []);
  });

  it('should leave the download link empty when the definition has neither a download nor a magnet field', () => {
    const { download: _download, ...fields } = definition.search.fields;
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: { ...definition, search: { ...definition.search, fields } },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });

    assert.deepEqual(page.map(item => [item.torrentUrl, item.url]), [
      ['', 'https://tracker.example.test/topic/101'],
      ['', 'https://tracker.example.test/topic/102'],
    ]);
  });

  it('should read Jackett result fields only when the definition declares them', () => {
    const fieldHtml = `
      <div class="result" data-category="1">
        <a href="topic/101">Sample Release</a><span class="seeders">1</span><span class="size">1 GB</span>
        <span class="grabs">1,234</span><span class="files">12</span><span class="imdb">title/tt123456/</span>
        <span class="tvdb">no id</span><span class="genre">Drama, Sci_Fi/drama</span><span class="year">2024</span>
        <span class="hash">abcDEF0123456789abcdef0123456789abcdef01</span>
      </div>`;
    const parse = (fields: Record<string, CardigannField>) =>
      parseSearchResults(load(fieldHtml), {
        context: {},
        definition: { ...definition, search: { ...definition.search, fields: { ...definition.search.fields, ...fields } } },
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      })[0];

    const declared = parse({
      album: { text: 'Sample Album' },
      author: { text: '' },
      files: { selector: '.files' },
      genre: { selector: '.genre' },
      grabs: { selector: '.grabs' },
      imdbid: { selector: '.imdb' },
      infohash: { selector: '.hash' },
      tmdbid: { optional: true, selector: '.missing' },
      tvdbid: { selector: '.tvdb' },
      year: { selector: '.year' },
    });
    assert.deepEqual(
      [declared.downloadCount, declared.files, declared.imdbId, declared.tvdbId, declared.tmdbId, declared.year],
      [1234, 12, 'tt0123456', 0, undefined, 2024]
    );
    assert.deepEqual(declared.genres, ['Drama', 'Sci Fi', 'drama']);
    assert.deepEqual([declared.album, declared.author, declared.artist], ['Sample Album', '', undefined]);
    assert.equal(declared.infoHash, 'abcDEF0123456789abcdef0123456789abcdef01');

    const undeclared = parse({});
    assert.deepEqual(
      [undeclared.downloadCount, undeclared.files, undeclared.imdbId, undeclared.genres, undeclared.year, undeclared.infoHash],
      [undefined, undefined, undefined, undefined, undefined, undefined]
    );
  });

  it('should take the IMDb id from whichever of imdb and imdbid the definition declares last', () => {
    const imdbHtml = '<div class="result" data-category="1"><a href="topic/101">Sample Release</a><span class="seeders">1</span><span class="size">1 GB</span><i class="a">tt1</i><i class="b">tt22</i></div>';
    const parseImdb = (fields: Record<string, CardigannField>) =>
      parseSearchResults(load(imdbHtml), {
        context: {},
        definition: { ...definition, search: { ...definition.search, fields: { ...definition.search.fields, ...fields } } },
        options: { query: '' },
        searchCaps: BASIC_SEARCH_CAPS,
        timeZone: 'Europe/Moscow',
        workingUrl: 'https://tracker.example.test/',
      })[0].imdbId;

    assert.equal(parseImdb({ imdb: { selector: '.a' }, imdbid: { selector: '.b' } }), 'tt0000022');
    assert.equal(parseImdb(Object.fromEntries([['imdbid', { selector: '.b' }], ['imdb', { selector: '.a' }]])), 'tt0000001');
  });

  it('should skip only rows whose required fields fail, as Jackett does', () => {
    const cells = '<span class="seeders">1</span><span class="size">1 GB</span>';
    const rowsHtml = `
      <div class="result" data-category="1"><a href="topic/101">Sample Complete Release</a>${cells}<b class="kind">x</b></div>
      <div class="result" data-category="1"><a href="topic/102">Sample Missing Selector</a><span class="seeders">1</span><b class="kind">x</b></div>
      <div class="result"><a href="topic/103">Sample Missing Attribute</a>${cells}<b class="kind">x</b></div>
      <div class="result" data-category="1"><a href="topic/104">Sample Unmatched Case</a>${cells}</div>`;
    const page = parseSearchResults(load(rowsHtml), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: {
            ...definition.search.fields,
            description: { selector: '.missing' },
            downloadvolumefactor: { case: { '.kind': 0 } },
            genre: { default: 'Sample Genre', selector: '.missing' },
          },
        },
      },
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });

    assert.deepEqual(page.map(item => [item.name, item.description, item.genres]), [
      ['Sample Complete Release', undefined, ['Sample', 'Genre']],
    ]);
  });

  it('should keep combining accents inside andmatch words', () => {
    const cells = '<span class="seeders">1</span><span class="size">1 GB</span>';
    const accentedHtml = `<div class="result" data-category="1"><a href="topic/103">Pre\u0301mie\u0300re Sample</a>${cells}</div>` +
      `<div class="result" data-category="1"><a href="topic/104">Pre mie re Sample</a>${cells}</div>`;
    const page = parseSearchResults(load(accentedHtml), {
      context: { Keywords: 'Pre\u0301mie\u0300re' },
      definition: { ...definition, search: { ...definition.search, rows: { filters: [{ name: 'andmatch' }], selector: '.result' } } },
      options: { query: 'Pre\u0301mie\u0300re' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.name), ['Pre\u0301mie\u0300re Sample']);
  });

  it('should evaluate case selectors with a wildcard fallback', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: { ...definition.search.fields, category: { case: Object.fromEntries([['.seeders:contains("1,234")', 1], ['*', 2]]) } },
        },
      },
      options: { categories: [2000], query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.category), ['1']);
  });

  it('should scope case selectors and render their values using the row context', () => {
    const page = parseSearchResults(load('<div class="result"><a>Example Release</a><span class="gold"></span><span class="selected silver"></span></div>'), {
      context: { Config: { factor: 0.5 } },
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: {
            downloadvolumefactor: { case: Object.fromEntries([['.gold', 0], ['.silver', '{{ .Config.factor }}'], ['*', 1]]), selector: '.selected' },
            title: { selector: '.result' },
          },
        },
      },
      options: { query: 'Example' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.equal(page[0].name, 'Example Release');
    assert.equal(page[0].downloadVolumeFactor, 0.5);
  });

  it('should honor case declaration order and omit values when the selected element is missing', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: {
            ...definition.search.fields,
            downloadvolumefactor: { case: { '*': 1, '.seeders': 0 } },
            uploadvolumefactor: { case: { '*': 2 }, optional: true, selector: '.missing' },
          },
        },
      },
      options: { query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.downloadVolumeFactor), [1, 1]);
    assert.deepEqual(page.map(item => item.uploadVolumeFactor), [undefined, undefined]);
  });

  it('should exclude rows that do not contain the requested keywords', () => {
    const page = parseSearchResults(load(testHtml), {
      context: { Keywords: 'Another Release' },
      definition: { ...definition, search: { ...definition.search, rows: { filters: [{ name: 'andmatch' }], selector: '.result' } } },
      options: { query: 'Another Release' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page, []);
  });

  it('should retain numeric transfer and seeding requirements declared by the definition', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition: {
        ...definition,
        search: {
          ...definition.search,
          fields: {
            ...definition.search.fields,
            downloadvolumefactor: { case: Object.fromEntries([['.seeders:contains("1,234")', 0.5], ['*', 1]]) },
            minimumratio: { text: 1 },
            minimumseedtime: { text: 0 },
            uploadvolumefactor: { text: 1 },
          },
        },
      },
      options: { query: 'Sample' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(page.map(item => item.downloadVolumeFactor), [0.5, 1]);
    assert.deepEqual(page.map(item => item.minimumSeedTimeSeconds), [0, 0]);
    assert.equal(page[0].minimumRatio, 1);
    assert.equal(page[0].uploadVolumeFactor, 1);
  });

  it('should give rows without a topic id or infohash stable ids across repeated searches', () => {
    const idlessDefinition: CardigannDefinition = {
      ...definition,
      search: { ...definition.search, fields: { title: { selector: 'a' } } },
    };
    const parse = (html: string) => parseSearchResults(load(html), {
      context: {},
      definition: idlessDefinition,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/search',
    }).map(item => [item.name, item.id]);

    const firstPage = parse('<div class="result"><a>Sample Show S01E01</a></div><div class="result"><a>Sample Show S01E02</a></div>');
    const secondPage = parse('<div class="result"><a>Sample Show S01E02</a></div>');

    assert.notEqual(firstPage[0][1], firstPage[1][1]);
    assert.match(String(firstPage[0][1]), /^[0-9a-f]{16}$/);
    assert.deepEqual(secondPage[0], firstPage[1]);
  });
});
