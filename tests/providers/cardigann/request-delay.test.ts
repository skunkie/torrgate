// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';
import { ProviderRegistry } from '../../../src/providers/registry.js';

describe('CardigannProvider request delay', () => {
  const delayedDefinition: CardigannDefinition = {
    id: 'delayedtracker',
    links: ['https://tracker.example.org/'],
    name: 'Delayed Tracker',
    requestDelay: 2,
    search: {
      fields: { title: { selector: 'td.title' } },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 10; round++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  const recordRequestTimes = (httpClient: HttpClient): number[] => {
    const requestTimes: number[] = [];
    const getDecoded = httpClient.getDecoded.bind(httpClient);
    httpClient.getDecoded = (url, encoding, options) => getDecoded(url, encoding, {
      ...options,
      adapter: async config => {
        requestTimes.push(Date.now());
        return {
          config,
          data: Buffer.from('<table><tr class="row"><td class="title">Example Release</td></tr></table>'),
          headers: {},
          status: 200,
          statusText: 'OK',
        };
      },
    });
    return requestTimes;
  };

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('should space concurrent searches by the definition requestDelay', async () => {
    const httpClient = new HttpClient();
    const requestTimes = recordRequestTimes(httpClient);
    const provider = new CardigannProvider(delayedDefinition, httpClient);

    const searches = Promise.all([provider.searchByTitle({ query: 'one' }), provider.searchByTitle({ query: 'two' })]);
    await settle();
    assert.deepEqual(requestTimes, [1_000]);
    mock.timers.tick(2_000);
    await searches;

    assert.deepEqual(requestTimes, [1_000, 3_000]);
  });

  it('should not delay requests when requestDelay is absent', async () => {
    const httpClient = new HttpClient();
    const requestTimes = recordRequestTimes(httpClient);
    const provider = new CardigannProvider({ ...delayedDefinition, requestDelay: undefined }, httpClient);

    await Promise.all([provider.searchByTitle({ query: 'one' }), provider.searchByTitle({ query: 'two' })]);

    assert.deepEqual(requestTimes, [1_000, 1_000]);
  });

  it('should claim a shared request slot per tracker once the registry shares request delays', async () => {
    const httpClient = new HttpClient();
    recordRequestTimes(httpClient);
    const registry = new ProviderRegistry(httpClient);
    const claimedKeys: string[] = [];
    registry.shareRequestDelays({
      claimSlot: async (key: string) => {
        claimedKeys.push(key);
        return 0;
      },
    });

    const search = registry.getProvider('newstudio')?.searchByTitle({ query: 'Example' });
    await settle();
    mock.timers.tick(2_000);
    await search;
    await registry.getProvider('rutor')?.searchByTitle({ query: 'sample' });

    assert.deepEqual(claimedKeys, ['request-slot:newstudio', 'request-slot:newstudio']);
  });
});
