// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { load } from 'cheerio';
import YAML from 'yaml';

import { HttpClient } from '../../../src/http/http-client.js';
import { BASIC_SEARCH_CAPS } from '../../../src/jackett/torznab/caps.js';
import { applyDefinitionOverride } from '../../../src/providers/cardigann/definition-overrides.js';
import { loadDefinitionsFromDir } from '../../../src/providers/cardigann/loader.js';
import { parseSearchResults } from '../../../src/providers/cardigann/search-results.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

describe('Local definition overrides', () => {
  const definition: CardigannDefinition = {
    caps: { categorymappings: [{ cat: 'Movies', id: '1' }] },
    id: 'sample.org',
    links: ['https://tracker.example.test/'],
    name: 'Sample Tracker',
    search: {
      fields: {
        description: { filters: [{ args: ' base suffix', name: 'append' }], text: 'Base notes' },
        title: { selector: 'a' },
      },
      paths: [{ path: '/search' }],
      rows: { selector: '.release' },
    },
  };
  const httpClient = new HttpClient();
  let definitionsDir: string;
  let overridePath: string;

  beforeEach(() => {
    definitionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torrgate-overrides-'));
    fs.writeFileSync(path.join(definitionsDir, 'sample.yml'), YAML.stringify(definition));
    fs.mkdirSync(path.join(definitionsDir, 'overrides'));
    overridePath = path.join(definitionsDir, 'overrides', 'sample.yml');
  });

  afterEach(() => {
    fs.rmSync(definitionsDir, { force: true, recursive: true });
  });

  it('should load the base definition when the override directory is absent', () => {
    fs.rmSync(path.dirname(overridePath), { recursive: true });
    const providers = loadDefinitionsFromDir(definitionsDir, httpClient);
    assert.equal(providers.length, 1);
    assert.deepEqual(providers[0].definition, definition);
  });

  it('should add posters and replace complete fields without modifying the base file or object', () => {
    const basePath = path.join(definitionsDir, 'sample.yml');
    const originalContent = fs.readFileSync(basePath, 'utf8');
    fs.writeFileSync(overridePath, YAML.stringify({
      search: {
        fields: {
          description: { selector: '.summary' },
          poster: {
            attribute: 'src',
            filters: [{ args: ['thumbnail', 'poster'], name: 'replace' }],
            selector: 'img',
          },
        },
      },
    }));
    const overridden = applyDefinitionOverride(definition, overridePath);
    assert.deepEqual(definition.search.fields.description, {
      filters: [{ args: ' base suffix', name: 'append' }], text: 'Base notes',
    });
    const providers = loadDefinitionsFromDir(definitionsDir, httpClient);
    assert.equal(providers.length, 1);
    assert.deepEqual(providers[0].definition, overridden);
    assert.deepEqual(overridden.caps, definition.caps);
    assert.deepEqual(overridden.search.paths, definition.search.paths);
    assert.deepEqual(overridden.search.rows, definition.search.rows);
    assert.deepEqual(Object.keys(overridden.search.fields), ['description', 'title', 'poster']);
    const page = parseSearchResults(load('<div class="release"><a>Тестовый Релиз</a><p class="summary">Тестовое описание</p><img src="/thumbnail.jpg"></div>'), {
      context: {},
      definition: overridden,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/search',
    });
    assert.equal(page[0].name, 'Тестовый Релиз');
    assert.equal(page[0].description, 'Тестовое описание');
    assert.equal(page[0].posterUrl, 'https://tracker.example.test/poster.jpg');
    assert.equal(fs.readFileSync(basePath, 'utf8'), originalContent);
    fs.unlinkSync(overridePath);
    assert.deepEqual(loadDefinitionsFromDir(definitionsDir, httpClient)[0].definition, definition);
  });

  it('should accept removal selectors, defaults, and field modifiers in local overrides', () => {
    fs.writeFileSync(overridePath, YAML.stringify({
      search: {
        fields: {
          'size|optional': { default: '1 GB', selector: '.missing' },
          title: { remove: 'span', selector: 'a' },
          'title|append': { text: ' Release' },
        },
      },
    }));
    const overridden = applyDefinitionOverride(definition, overridePath);
    const items = parseSearchResults(load('<div class="release"><a>Sample<span> Promotion</span></a></div>'), {
      context: {},
      definition: overridden,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/',
    });
    assert.deepEqual(items.map(item => [item.name, item.sizeBytes]), [['Sample Release', 1024 ** 3]]);
  });

  it('should match filenames and extensions rather than provider identifiers', () => {
    const content = YAML.stringify({ search: { fields: { poster: { text: 'https://images.example.test/sample.jpg' } } } });
    for (const name of ['sample.org.yml', 'sample.yaml', 'orphan.yml']) {
      fs.writeFileSync(path.join(definitionsDir, 'overrides', name), content);
    }
    assert.deepEqual(loadDefinitionsFromDir(definitionsDir, httpClient)[0].definition, definition);
    fs.renameSync(path.join(definitionsDir, 'sample.yml'), path.join(definitionsDir, 'sample.yaml'));
    const providers = loadDefinitionsFromDir(definitionsDir, httpClient);
    assert.equal(providers.length, 1);
    assert.deepEqual(providers[0].definition.search.fields.poster, { text: 'https://images.example.test/sample.jpg' });
  });

  it('should evaluate added fields in declaration order using shared templates and filters', () => {
    fs.writeFileSync(overridePath, `search:
  fields:
    posterPath:
      case:
        .release: /sample.jpg
      selector: a
    poster:
      filters:
        - args: https://images.example.test
          name: prepend
      text: '{{ .Result.posterPath }}'
`);
    const overridden = applyDefinitionOverride(definition, overridePath);
    const page = parseSearchResults(load('<div class="release"><a class="release">Example Release</a></div>'), {
      context: {},
      definition: overridden,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/search',
    });
    assert.equal(page[0].posterUrl, 'https://images.example.test/sample.jpg');
  });

  it('should accept optional Cardigann fields and retain releases with missing optional metadata', () => {
    fs.writeFileSync(overridePath, YAML.stringify({
      search: {
        fields: {
          description: { optional: true, selector: '.summary' },
          poster: { attribute: 'src', optional: true, selector: 'img' },
        },
      },
    }));
    const overridden = loadDefinitionsFromDir(definitionsDir, httpClient)[0].definition;
    assert.deepEqual(overridden.search.fields.poster, { attribute: 'src', optional: true, selector: 'img' });
    const page = parseSearchResults(load('<div class="release"><a>Sample Release</a></div>'), {
      context: {},
      definition: overridden,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/search',
    });
    assert.equal(page.length, 1);
    assert.equal(page[0].name, 'Sample Release');
    assert.equal(page[0].description, undefined);
    assert.equal(page[0].posterUrl, undefined);
  });

  it('should replace or clear tracker lists without changing search fields or the base definition', () => {
    const base = { ...definition, trackers: ['https://base.example.test/announce'] };
    for (const trackers of [['udp://announce.example.test:6969/announce', 'https://announce.example.test/announce'], []]) {
      fs.writeFileSync(overridePath, YAML.stringify({ trackers }));
      const overridden = applyDefinitionOverride(base, overridePath);
      assert.deepEqual(overridden.trackers, trackers);
      assert.deepEqual(overridden.search, definition.search);
      assert.deepEqual(base.trackers, ['https://base.example.test/announce']);
    }
  });

  it('should combine field and tracker overrides when constructing and supplementing magnets', () => {
    const trackers = ['https://announce.example.test/announce', 'udp://announce.example.test:6969/announce'];
    fs.writeFileSync(overridePath, YAML.stringify({
      search: {
        fields: {
          infohash: { optional: true, selector: '.hash' },
          magnet: { attribute: 'href', optional: true, selector: '.magnet' },
        },
      },
      trackers,
    }));
    const overridden = loadDefinitionsFromDir(definitionsDir, httpClient)[0].definition;
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const page = parseSearchResults(load(`
      <div class="release"><a>Sample Hash Release</a><span class="hash">${hash}</span></div>
      <div class="release"><a>Sample Magnet Release</a><a class="magnet" href="magnet:?xt=urn:btih:${hash}&amp;dn=Sample">Magnet</a></div>
      <div class="release"><a>Sample Announced Release</a><a class="magnet" href="magnet:?xt=urn:btih:${hash}&amp;tr=https%3A%2F%2Foriginal.example.test%2Fannounce">Magnet</a></div>
    `), {
      context: {},
      definition: overridden,
      options: { query: '' },
      searchCaps: BASIC_SEARCH_CAPS,
      timeZone: 'UTC',
      workingUrl: 'https://tracker.example.test/search',
    });
    assert.equal(page.length, 3);
    assert.deepEqual(new URL(page[0].magnetUri!).searchParams.getAll('tr'), trackers);
    assert.deepEqual(new URL(page[1].magnetUri!).searchParams.getAll('tr'), trackers);
    assert.equal(new URL(page[1].magnetUri!).searchParams.get('dn'), 'Sample');
    assert.deepEqual(new URL(page[2].magnetUri!).searchParams.getAll('tr'), ['https://original.example.test/announce']);
  });

  it('should load restored announce lists for their matching indexers', () => {
    const providers = loadDefinitionsFromDir(path.resolve('definitions'), httpClient);
    const expected = {
      kinozal: ['http://retracker.local/announce'],
      'noname-club': [
        'http://retracker.local/announce',
        'http://bt01.nnm-club.info:2710/announce',
        'http://bt02.nnm-club.info:2710/announce',
        'http://bt01.nnm-club.cc:2710/announce',
        'http://bt02.nnm-club.cc:2710/announce',
      ],
      rutor: [
        'http://retracker.local/announce',
        'udp://opentor.net:6969',
        'udp://bt.rutor.info:2710',
        'udp://bt.rutor.is:2710',
      ],
      rutracker: [
        'http://retracker.local/announce',
        'http://bt.t-ru.org/ann',
        'http://bt2.t-ru.org/ann',
        'http://bt3.t-ru.org/ann',
        'http://bt4.t-ru.org/ann',
      ],
    };
    for (const [id, trackers] of Object.entries(expected)) {
      assert.deepEqual(providers.find(provider => provider.id === id)?.definition.trackers, trackers, id);
    }
    const publicRuTracker = providers.find(provider => provider.id === 'rutracker-ru');
    assert.ok(publicRuTracker);
    assert.equal(publicRuTracker.definition.trackers, undefined);
  });

  for (const content of [
    'search: [',
    'null',
    'search: null',
    'search: {fields: []}',
    'id: another-tracker\nsearch: {fields: {}}',
    'search: {paths: [], fields: {}}',
    'search: {fields: {poster: null}}',
    'search: {fields: {poster: {selector: 123}}}',
    'search: {fields: {poster: {optional: "true"}}}',
    'search: {fields: {poster: {unknown: true}}}',
    'search: {fields: {poster: {filters: [{name: append, args: {path: sample}}]}}}',
    'trackers: null',
    'trackers: https://announce.example.test/announce',
    'trackers: [123]',
    'trackers: [" "]',
    'search: {fields: {poster: {text: https://images.example.test/sample.jpg}}}\ntrackers: [null]',
  ]) {
    it(`should warn and retain the base provider for invalid override ${JSON.stringify(content)}`, context => {
      const warn = context.mock.method(console, 'warn', () => {});
      fs.writeFileSync(overridePath, content);
      const providers = loadDefinitionsFromDir(definitionsDir, httpClient);
      assert.equal(providers.length, 1);
      assert.deepEqual(providers[0].definition, definition);
      assert.equal(warn.mock.callCount(), 1);
      assert.match(String(warn.mock.calls[0].arguments[0]), /Failed to load definition override/);
    });
  }

  it('should warn and retain the base definition when the override cannot be read', context => {
    const warn = context.mock.method(console, 'warn', () => {});
    fs.mkdirSync(overridePath);
    assert.equal(applyDefinitionOverride(definition, overridePath), definition);
    assert.equal(warn.mock.callCount(), 1);
  });
});
