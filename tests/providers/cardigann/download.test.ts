// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

describe('CardigannProvider download transport', () => {
  const definition: CardigannDefinition = {
    id: 'sample-secure-tracker',
    links: ['https://tracker.example/'],
    login: { method: 'get', path: 'login' },
    name: 'Sample Secure Tracker',
    search: {
      fields: { title: { selector: 'a' } },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr' },
    },
  };

  it('should reject unconfigured transports before authenticating or sending cookies', async () => {
    const httpClient = new HttpClient();
    let loginCount = 0;
    let requestCount = 0;
    httpClient.getBinary = async () => {
      requestCount++;
      return { data: Buffer.alloc(0), headers: {} };
    };
    const provider = new CardigannProvider(definition, httpClient);
    provider.sessionManager.ensureSessionValid = async () => { loginCount++; return true; };
    provider.sessionManager.getCookieHeader = () => 'bb_session=test-session';

    for (const url of ['http://tracker.example/download', 'https://tracker.example:8443/download']) {
      await assert.rejects(provider.downloadTorrent(url), /not allowed/);
    }
    assert.equal(loginCount, 0);
    assert.equal(requestCount, 0);
  });

  it('should enforce configured transport on authenticated download redirects', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(definition, httpClient);
    provider.sessionManager.ensureSessionValid = async () => true;
    provider.sessionManager.getCookieHeader = () => 'bb_session=test-session';
    for (const target of ['http://tracker.example/download', 'https://tracker.example:8443/download']) {
      httpClient.getBinary = async (url, options = {}) => {
        assert.equal(options.headers?.Cookie, 'bb_session=test-session');
        assert.ok(options.beforeRedirect);
        options.beforeRedirect({}, { headers: { location: target }, statusCode: 302 }, { headers: {}, method: 'GET', url });
        return { data: Buffer.alloc(0), headers: {} };
      };
      await assert.rejects(provider.downloadTorrent('https://tracker.example/download'), /not allowed/);
    }
  });
});
