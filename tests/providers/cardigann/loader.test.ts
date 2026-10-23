// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { getDefinitionCategoryMappings } from '../../../src/providers/cardigann/categories.js';
import { loadDefinitionsFromDir } from '../../../src/providers/cardigann/loader.js';

describe('Cardigann Definition Loader', () => {
  const httpClient = new HttpClient();

  it('should load valid definitions from the definitions directory', () => {
    const definitionsDir = path.resolve(process.cwd(), 'definitions');
    const providers = loadDefinitionsFromDir(definitionsDir, httpClient);

    assert.ok(Array.isArray(providers));
    assert.ok(providers.length > 0);

    const rutor = providers.find(p => p.definition.id === 'rutor');
    assert.ok(rutor);
    assert.equal(rutor.name, 'RuTor');
    assert.ok(rutor.urls.includes('https://rutor.info/'));
  });

  it('should return empty array for non-existent directory', () => {
    const emptyDir = path.resolve(process.cwd(), 'non-existent-dir-12345');
    const providers = loadDefinitionsFromDir(emptyDir, httpClient);
    assert.deepEqual(providers, []);
  });

  it('should read named category declarations without inventing descriptions', () => {
    const providers = loadDefinitionsFromDir(path.resolve(process.cwd(), 'definitions'), httpClient);
    const provider = providers.find(provider => provider.id === 'torrentby');
    assert.ok(provider);
    assert.deepEqual(getDefinitionCategoryMappings(provider.definition.caps), [{ cat: 'Other', id: 'Other' }]);
    assert.deepEqual(provider.definition.caps?.categories, { Other: 'Other' });
  });
});
