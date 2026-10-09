// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { buildApp } from '../../src/index.js';

describe('Configured CORS responses', () => {
  const originalEnv = { ...process.env };
  const sampleApiKey = 'sample-cors-key';

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    process.env.API_KEY = sampleApiKey;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  for (const corsOrigin of [undefined, '*', 'https://client.example:8443']) {
    it(`should serve configured CORS headers with CORS_ORIGIN=${String(corsOrigin)}`, async () => {
      if (corsOrigin !== undefined) process.env.CORS_ORIGIN = corsOrigin;
      const testServer = http.createServer(buildApp());
      try {
        await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
        const port = (testServer.address() as { port: number }).port;
        const url = `http://127.0.0.1:${port}/api/v2.0/indexers`;
        for (const origin of ['https://client.example:8443', 'https://untrusted.example']) {
          const response = await fetch(url, {
            headers: { Origin: origin, 'X-Api-Key': sampleApiKey },
          });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('access-control-allow-origin'), corsOrigin ?? '*');

          const preflight = await fetch(url, {
            headers: {
              'Access-Control-Request-Headers': 'Authorization, X-Api-Key',
              'Access-Control-Request-Method': 'GET',
              Origin: origin,
            },
            method: 'OPTIONS',
          });
          assert.equal(preflight.status, 204);
          assert.equal(preflight.headers.get('access-control-allow-origin'), corsOrigin ?? '*');
          assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Authorization, X-Api-Key/);
        }
      } finally {
        await new Promise<void>(resolve => testServer.close(() => resolve()));
      }
    });
  }
});
