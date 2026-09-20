// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import vercelHandler from '../../api/index.js';
import { JackettIndexer } from '../../src/types/jackett.js';

describe('Vercel Serverless Function Entrypoint', () => {
  let baseUrl: string;
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer(vercelHandler);
    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
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

  it('should route GET /api/v2.0/indexers via Vercel handler', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettIndexer[];
    assert.equal(Array.isArray(data), true);
    assert.ok(data.length > 0);
  });

  it('should route GET /api/v2.0/indexers/openapi.yaml via Vercel handler', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/openapi.yaml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/yaml/);

    const yaml = await res.text();
    assert.match(yaml, /version: \d+\.\d+\.\d+/);
  });

  it('should return 404 for nonexistent routes via Vercel handler', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/unknown-endpoint-12345`);
    assert.equal(res.status, 404);
  });
});
