// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { CacheWrite } from '../../src/cache/store.js';
import { getTopicPathStore } from '../../src/cache/topic-path-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { AGGREGATE_INDEXER_ID, ProviderRegistry } from '../../src/providers/registry.js';

const definitionYaml = (id: string, name: string): string => `id: ${id}
name: ${name}
links:
  - https://${id}.example.org/
search:
  paths:
    - path: search
  rows:
    selector: tr.row
  fields:
    title:
      selector: td.title
`;

describe('ProviderRegistry definition loading', () => {
  let definitionsDir: string;

  before(() => {
    definitionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torrgate-registry-test-'));
    fs.writeFileSync(path.join(definitionsDir, 'a-sample.yml'), definitionYaml('sampletracker', 'Sample Tracker'));
    fs.writeFileSync(path.join(definitionsDir, 'b-duplicate.yml'), definitionYaml('sampletracker', 'Duplicate Sample Tracker'));
    fs.writeFileSync(path.join(definitionsDir, 'c-reserved.yml'), definitionYaml(AGGREGATE_INDEXER_ID, 'Reserved Sample'));
  });

  after(() => {
    fs.rmSync(definitionsDir, { force: true, recursive: true });
  });

  it('should keep the first definition for an id and skip later duplicates', () => {
    const registry = new ProviderRegistry(new HttpClient(), definitionsDir);
    assert.deepEqual(registry.getAllProviders().map(provider => provider.name), ['Sample Tracker']);
    assert.equal(registry.getProvider('sampletracker')?.name, 'Sample Tracker');
  });

  it('should skip definitions that use the reserved aggregate id', () => {
    const registry = new ProviderRegistry(new HttpClient(), definitionsDir);
    assert.equal(registry.getProvider(AGGREGATE_INDEXER_ID), undefined);
  });

  it('should refuse to register a provider under the reserved aggregate id', () => {
    const registry = new ProviderRegistry(new HttpClient(), definitionsDir);
    const reservedProvider = new CardigannProvider(
      {
        id: AGGREGATE_INDEXER_ID,
        links: ['https://reserved.example.org/'],
        name: 'Reserved Sample',
        search: { fields: {}, paths: [{ path: 'search' }], rows: { selector: 'tr' } },
      },
      new HttpClient()
    );
    assert.throws(() => registry.registerProvider(reservedProvider), /reserved for searching every indexer/);
  });
});

describe('ProviderRegistry cached topic path recovery', () => {
  it('should republish paths for every provider with one shared batch', async context => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => '<table><tr><td><a href="viewtopic.php?t=42">Sample Topic</a></td></tr></table>';
    const registry = new ProviderRegistry(httpClient, 'tests/fixtures');
    const providers = ['firstsample', 'secondsample'].map(id => new CardigannProvider({
      id,
      links: [`https://${id}.example/`],
      name: id,
      search: {
        fields: {
          details: { attribute: 'href', selector: 'a' },
          title: { selector: 'a' },
        },
        paths: [{ path: '{{ .Keywords }}/tracker.php' }],
        rows: { selector: 'tr' },
      },
    }, httpClient));
    for (const provider of providers) registry.registerProvider(provider);
    const cache = new MemoryCache<unknown>();
    registry.shareTopicPaths(cache, 'sample-deployment', 300);
    const topicPaths: Record<string, CacheWrite<string>[]> = {};
    const entries: CacheWrite<string>[] = [];
    for (const provider of providers) {
      const [item] = await provider.searchByTitle({ query: 'Sample' });
      const entry = provider.getTopicPathCacheEntry(item);
      assert.ok(entry);
      topicPaths[provider.id] = [entry];
      entries.push(entry);
    }
    const sharedStore = getTopicPathStore(cache);
    await sharedStore.clear();
    const writeMock = context.mock.method(sharedStore, 'setMany');
    await registry.restoreTopicPaths(topicPaths);
    assert.equal(writeMock.mock.callCount(), 1);
    assert.deepEqual(writeMock.mock.calls[0].arguments, [entries, 600]);
    for (const { key, value } of entries) assert.equal(await sharedStore.get(key), value);
  });
});
