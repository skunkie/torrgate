// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { CategoryMapping } from '../../src/types/torrent.js';

describe('CategoryController Integration', () => {
  let baseUrl: string;
  let registry: ProviderRegistry;
  let testServer: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    registry = new ProviderRegistry(httpClient);

    const app = createApp(registry);

    await new Promise<void>(resolve => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('should return categories list for valid indexer', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/categories`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);

    const data = (await res.json()) as CategoryMapping[];
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
    assert.ok(data[0].id !== undefined);
    assert.ok(data[0].name !== undefined);
  });

  it('should return 400 Bad Request on invalid indexer identifier format', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/bad%20indexer!/categories`);
    assert.equal(res.status, 400);

    const data = (await res.json()) as { error: string };
    assert.equal(data.error, 'BadRequest');
  });

  it('should return 404 Not Found on unknown indexer', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/nonexistent_indexer/categories`);
    assert.equal(res.status, 404);

    const data = (await res.json()) as { error: string };
    assert.equal(data.error, 'NotFound');
  });
});
