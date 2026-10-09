// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { ApiErrorResponse, MagnetResponse } from '../../src/types/api.js';

describe('Download redirect validation', () => {
  let baseUrl: string;
  let testProxyServer: http.Server;
  const receivedUrls: string[] = [];
  let testServer: http.Server;
  const testTorrent = 'd4:infod6:lengthi5e4:name15:Example Release12:piece lengthi16384e6:pieces20:AAAAAAAAAAAAAAAAAAAAee';

  before(async () => {
    testProxyServer = http.createServer((req, res) => {
      const url = req.url || '';
      receivedUrls.push(url);
      const target = new URL(url);
      const redirects: Record<string, string> = {
        '/alternate': 'http://mirror.example.test/final',
        '/blocked': 'http://disallowed.example.test/private',
        '/chain-blocked': '/blocked',
        '/mirror': 'http://files.tracker.example.test/final',
        '/relative': '/mirror',
        '/wrong-port': 'http://tracker.example.test:8443/final',
        '/wrong-scheme': 'https://tracker.example.test/final',
      };
      const location = redirects[target.pathname];
      if (location) {
        res.writeHead(302, { Location: location });
        res.end();
      } else {
        res.end(testTorrent);
      }
    });
    await new Promise<void>(resolve => testProxyServer.listen(0, '127.0.0.1', resolve));
    const proxyPort = (testProxyServer.address() as { port: number }).port;
    const httpClient = new HttpClient({ host: '127.0.0.1', port: proxyPort, url: `http://127.0.0.1:${proxyPort}` }, 2000);
    const registry = new ProviderRegistry(httpClient);
    registry.registerProvider(new CardigannProvider({
      id: 'redirect-test',
      links: ['http://tracker.example.test/', 'http://mirror.example.test/'],
      name: 'Sample Redirect Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    }, httpClient));
    testServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}`;
  });

  after(async () => {
    await Promise.all([testServer, testProxyServer].map(testServer =>
      new Promise<void>(resolve => testServer.close(() => resolve()))
    ));
  });

  it('should follow relative redirects and redirects to allowed download subdomains', async () => {
    receivedUrls.length = 0;
    const url = encodeURIComponent('http://tracker.example.test/relative');
    const response = await fetch(`${baseUrl}/api/v2.0/indexers/redirect-test/download?url=${url}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), testTorrent);
    assert.deepEqual(receivedUrls, [
      'http://tracker.example.test/relative',
      'http://tracker.example.test/mirror',
      'http://files.tracker.example.test/final',
    ]);
  });

  it('should follow redirects to another configured tracker mirror', async () => {
    receivedUrls.length = 0;
    const url = encodeURIComponent('http://tracker.example.test/alternate');
    const response = await fetch(`${baseUrl}/api/v2.0/indexers/redirect-test/download?url=${url}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), testTorrent);
    assert.deepEqual(receivedUrls, [
      'http://tracker.example.test/alternate',
      'http://mirror.example.test/final',
    ]);
  });

  for (const endpoint of ['download', 'magnet']) {
    it(`should reject mismatched schemes and ports before a ${endpoint} request`, async () => {
      for (const targetUrl of ['https://tracker.example.test/final', 'http://tracker.example.test:8443/final']) {
        receivedUrls.length = 0;
        const response = await fetch(`${baseUrl}/api/v2.0/indexers/redirect-test/${endpoint}?url=${encodeURIComponent(targetUrl)}`);
        assert.equal(response.status, 403);
        assert.deepEqual(receivedUrls, []);
      }
    });

    it(`should reject scheme and port changes in ${endpoint} redirects`, async () => {
      for (const path of ['/wrong-port', '/wrong-scheme']) {
        receivedUrls.length = 0;
        const targetUrl = `http://tracker.example.test${path}`;
        const response = await fetch(`${baseUrl}/api/v2.0/indexers/redirect-test/${endpoint}?url=${encodeURIComponent(targetUrl)}`);
        assert.equal(response.status, 502);
        assert.deepEqual(receivedUrls, [targetUrl]);
      }
    });

    it(`should reject disallowed redirects at every hop of a ${endpoint} request`, async () => {
      for (const path of ['/blocked', '/chain-blocked']) {
        receivedUrls.length = 0;
        const url = encodeURIComponent(`http://tracker.example.test${path}`);
        const response = await fetch(`${baseUrl}/api/v2.0/indexers/redirect-test/${endpoint}?url=${url}`);
        assert.equal(response.status, 502);
        const body = await response.json() as ApiErrorResponse;
        assert.match(body.message, /Target download host is not allowed/);
        assert.deepEqual(receivedUrls, path === '/blocked'
          ? ['http://tracker.example.test/blocked']
          : ['http://tracker.example.test/chain-blocked', 'http://tracker.example.test/blocked']);
      }
    });
  }
});

describe('Download Proxy Controller Integration', () => {
  let baseUrl: string;
  let server: http.Server;

  let httpClient: HttpClient;

  before(async () => {
    httpClient = new HttpClient();
    httpClient.getBinary = async () => ({ data: Buffer.from('d8:announce31:http://retracker.local/announcee'), headers: {} });

    const registry = new ProviderRegistry(httpClient);
    const app = createApp(registry);

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('should proxy .torrent file downloads with correct headers', async () => {
    const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/x-bittorrent');
    assert.match(res.headers.get('content-disposition') || '', /attachment; filename=/);

    const buffer = await res.arrayBuffer();
    const text = Buffer.from(buffer).toString('utf-8');
    assert.equal(text, 'd8:announce31:http://retracker.local/announcee');
  });

  it('should pass on the tracker file name from Content-Disposition', async () => {
    const originalGetBinary = httpClient.getBinary;
    httpClient.getBinary = async () => ({
      data: Buffer.from('d8:announce31:http://retracker.local/announcee'),
      headers: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('Тестовый Релиз [2026].torrent')}` },
    });
    try {
      const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);
      assert.equal(res.status, 200);
      const header = res.headers.get('content-disposition') || '';
      assert.match(header, /filename="_+ _+ \[2026\]\.torrent"/);
      assert.ok(header.includes(`filename*=UTF-8''${encodeURIComponent('Тестовый Релиз [2026].torrent')}`));
    } finally {
      httpClient.getBinary = originalGetBinary;
    }
  });

  it('should successfully proxy download using base64url-encoded path parameter', async () => {
    const originalGetBinary = httpClient.getBinary;
    httpClient.getBinary = async () => ({ data: Buffer.from('d8:announce31:http://retracker.local/announcee'), headers: {} });

    try {
      const encodedPath = Buffer.from('https://rutor.info/download/12345').toString('base64url');
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?path=${encodedPath}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/x-bittorrent');
      const buffer = await res.arrayBuffer();
      const text = Buffer.from(buffer).toString('utf-8');
      assert.equal(text, 'd8:announce31:http://retracker.local/announcee');
    } finally {
      httpClient.getBinary = originalGetBinary;
    }
  });

  it('should return 403 Forbidden when download host is not allowed for provider (SSRF protection)', async () => {
    const sampleUrl = encodeURIComponent('http://169.254.169.254/latest/meta-data');
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);

    assert.equal(res.status, 403);
    const body = (await res.json()) as ApiErrorResponse;
    assert.equal(body.error, 'Forbidden');
    assert.match(body.message, /not allowed/);
  });

  it('should return 502 when upstream returns an HTML error page instead of torrent file', async () => {
    const originalGetBinary = httpClient.getBinary;
    httpClient.getBinary = async () => ({ data: Buffer.from('<!doctype html><html><body>Login required</body></html>'), headers: {} });

    try {
      const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);

      assert.equal(res.status, 502);
      const body = (await res.json()) as ApiErrorResponse;
      assert.equal(body.error, 'BadGateway');
      assert.match(body.message, /non-torrent response/);
    } finally {
      httpClient.getBinary = originalGetBinary;
    }
  });

  it('should return 400 when url parameter is missing', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download`);
    assert.equal(res.status, 400);

    const body = (await res.json()) as ApiErrorResponse;
    assert.equal(body.error, 'BadRequest');
  });

  it('should return 400 when indexer format is invalid', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor!bad/download?url=https%3A%2F%2Frutor.info%2Fdownload%2F12345`);
    assert.equal(res.status, 400);

    const body = (await res.json()) as ApiErrorResponse;
    assert.equal(body.error, 'BadRequest');
    assert.match(body.message, /Invalid indexer identifier format/);
  });

  it('should return 403 for unauthorized mirror apex domain collisions', async () => {
    // rutor.info should not allow evil-rutor.info or info
    const sampleUrl = encodeURIComponent('https://evilrutor.info/download/12345');
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);

    assert.equal(res.status, 403);
    const body = (await res.json()) as ApiErrorResponse;
    assert.equal(body.error, 'Forbidden');
  });

  it('should return 502 when buffer starts with d but does not contain bencode keys', async () => {
    const originalGetBinary = httpClient.getBinary;
    httpClient.getBinary = async () => ({ data: Buffer.from('dummy text starting with d but not a real bencoded torrent'), headers: {} });

    try {
      const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${sampleUrl}`);

      assert.equal(res.status, 502);
      const body = (await res.json()) as ApiErrorResponse;
      assert.equal(body.error, 'BadGateway');
    } finally {
      httpClient.getBinary = originalGetBinary;
    }
  });

  describe('magnet endpoint', () => {
    const testInfo = 'd6:lengthi5e4:name15:Example Release12:piece lengthi16384e6:pieces20:AAAAAAAAAAAAAAAAAAAAe';
    const testTorrent = `d8:announce31:http://retracker.local/announce4:info${testInfo}e`;

    it('should return the info hash and magnet URI built from the .torrent file', async () => {
      const originalGetBinary = httpClient.getBinary;
      httpClient.getBinary = async () => ({ data: Buffer.from(testTorrent), headers: {} });

      try {
        const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
        const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/magnet?url=${sampleUrl}`);

        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /application\/json/);
        const body = (await res.json()) as MagnetResponse;
        assert.deepEqual(body, {
          InfoHash: 'FEE52EFEE94D37966452F02FFD4148E5308811E0',
          MagnetUri:
            'magnet:?xt=urn:btih:FEE52EFEE94D37966452F02FFD4148E5308811E0&dn=Example%20Release&tr=http%3A%2F%2Fretracker.local%2Fannounce',
        });
      } finally {
        httpClient.getBinary = originalGetBinary;
      }
    });

    it('should return 502 when the .torrent file has no v1 info dictionary', async () => {
      const originalGetBinary = httpClient.getBinary;
      httpClient.getBinary = async () => ({ data: Buffer.from('d8:announce31:http://retracker.local/announcee'), headers: {} });

      try {
        const sampleUrl = encodeURIComponent('https://rutor.info/download/12345');
        const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/magnet?url=${sampleUrl}`);

        assert.equal(res.status, 502);
        const body = (await res.json()) as ApiErrorResponse;
        assert.equal(body.error, 'BadGateway');
        assert.match(body.message, /info dictionary/);
      } finally {
        httpClient.getBinary = originalGetBinary;
      }
    });

    it('should return 403 for a host that is not an allowed mirror', async () => {
      const sampleUrl = encodeURIComponent('http://169.254.169.254/latest/meta-data');
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/magnet?url=${sampleUrl}`);

      assert.equal(res.status, 403);
      const body = (await res.json()) as ApiErrorResponse;
      assert.equal(body.error, 'Forbidden');
    });

    it('should return 400 when url parameter is missing', async () => {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/magnet`);
      assert.equal(res.status, 400);
    });
  });
});
