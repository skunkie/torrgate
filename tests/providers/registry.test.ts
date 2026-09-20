// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

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
