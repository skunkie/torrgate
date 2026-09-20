// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient, mergeCookieHeader } from '../../src/http/http-client.js';

describe('HttpClient', () => {
  let baseUrl: string;
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      if (req.url === '/test-status-403' && req.method === 'GET') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden Access');
      } else if (req.url === '/test-status-500' && req.method === 'GET') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      } else if (req.url === '/test-status-200' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK Success');
      } else if (req.url === '/test-form-win1251' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(body);
        });
      } else if (req.url === '/test-abort' && req.method === 'GET') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('Delayed Response');
        }, 1000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

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

  it('should throw AxiosError for 4xx and 5xx status codes by default', async () => {
    const httpClient = new HttpClient();
    await assert.rejects(async () => {
      await httpClient.getDecoded(`${baseUrl}/test-status-403`);
    });
    await assert.rejects(async () => {
      await httpClient.getDecoded(`${baseUrl}/test-status-500`);
    });
  });

  it('should allow custom validateStatus overriding default rejection', async () => {
    const httpClient = new HttpClient();
    const result = await httpClient.requestDecoded(`${baseUrl}/test-status-403`, {
      validateStatus: () => true,
    });
    assert.equal(result.status, 403);
    assert.equal(result.content, 'Forbidden Access');
  });

  it('should transcode windows-1251 form fields into single-byte percent-encoded representation', async () => {
    const httpClient = new HttpClient();
    const response = await httpClient.postForm(
      `${baseUrl}/test-form-win1251`,
      {
        page: '1',
        query: 'тест',
      },
      'windows-1251'
    );

    // In windows-1251: 'т'=0xF2, 'е'=0xE5, 'с'=0xF1, 'т'=0xF2 -> %F2%E5%F1%F2
    assert.match(response.content, /query=%F2%E5%F1%F2/);
    assert.match(response.content, /page=1/);
  });

  it('should abort requests when AbortSignal is triggered', async () => {
    const httpClient = new HttpClient();
    const controller = new AbortController();

    const requestPromise = httpClient.getDecoded(`${baseUrl}/test-abort`, 'utf-8', {
      signal: controller.signal,
    });

    controller.abort();

    await assert.rejects(async () => {
      await requestPromise;
    });
  });

  it('should initialize with proxy configuration when provided', () => {
    const proxyClient = new HttpClient({
      host: '127.0.0.1',
      password: 'proxypassword',
      port: 8080,
      url: 'http://proxyuser:proxypassword@127.0.0.1:8080',
      username: 'proxyuser',
    });
    assert.ok(proxyClient);
  });
});

describe('HttpClient outbound proxy', () => {
  let proxyServer: http.Server;
  let proxyUrl: string;
  const receivedRequests: string[] = [];

  before(async () => {
    proxyServer = http.createServer((req, res) => {
      receivedRequests.push(`${req.method} ${req.url}`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>proxied sample page</html>');
    });
    proxyServer.on('connect', (req, socket) => {
      receivedRequests.push(`CONNECT ${req.url}`);
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    });
    await new Promise<void>(resolve => {
      proxyServer.listen(0, '127.0.0.1', () => {
        proxyUrl = `http://127.0.0.1:${(proxyServer.address() as { port: number }).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => proxyServer.close(() => resolve()));
  });

  it('should forward plain-HTTP requests as absolute URIs instead of CONNECT tunnels', async () => {
    const proxyPort = Number(new URL(proxyUrl).port);
    const proxyClient = new HttpClient({ host: '127.0.0.1', port: proxyPort, url: proxyUrl }, 2000);

    const content = await proxyClient.getDecoded('http://tracker.example.test/browse.php');
    assert.match(content, /proxied sample page/);
    assert.deepEqual(receivedRequests, ['GET http://tracker.example.test/browse.php']);
  });
});

describe('HttpClient form login redirects', () => {
  let otherHostUrl: string;
  let testServer: http.Server;
  let testServerUrl: string;
  const cookiesSeenByHop: Record<string, string> = {};

  before(async () => {
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      cookiesSeenByHop[url.pathname] = req.headers.cookie ?? '';
      if (url.pathname === '/login.php') {
        req.resume();
        req.on('end', () => {
          res.writeHead(302, { 'Location': '/step.php', 'Set-Cookie': 'bb_session=sample-session; path=/' });
          res.end();
        });
      } else if (url.pathname === '/step.php') {
        res.writeHead(302, { 'Location': '/index.php', 'Set-Cookie': 'bb_data=sample-data; path=/' });
        res.end();
      } else if (url.pathname === '/leave.php') {
        res.writeHead(302, { 'Location': `${otherHostUrl}/landing.php`, 'Set-Cookie': 'bb_session=sample-session; path=/' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>Welcome, Sample User</html>');
      }
    });
    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        const port = (testServer.address() as { port: number }).port;
        testServerUrl = `http://127.0.0.1:${port}`;
        otherHostUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should keep cookies set on every redirect hop after a form POST', async () => {
    const response = await new HttpClient().postForm(`${testServerUrl}/login.php`, { login_username: 'sample-user' });

    assert.equal(response.status, 200);
    assert.match(response.content, /Welcome, Sample User/);
    assert.deepEqual(response.cookies.map(cookie => cookie.split(';')[0]), [
      'bb_session=sample-session',
      'bb_data=sample-data',
    ]);
    assert.equal(cookiesSeenByHop['/step.php'], 'bb_session=sample-session');
    assert.equal(cookiesSeenByHop['/index.php'], 'bb_session=sample-session; bb_data=sample-data');
  });

  it('should not send collected cookies to a different host', async () => {
    await new HttpClient().postForm(`${testServerUrl}/leave.php`, { login_username: 'sample-user' });
    assert.equal(cookiesSeenByHop['/landing.php'], '');
  });
});

describe('mergeCookieHeader', () => {
  it('should combine an existing header with Set-Cookie values, later values winning', () => {
    assert.equal(
      mergeCookieHeader('a=1; b=2', ['b=3; Path=/', 'c=4; HttpOnly', 'a=; Max-Age=0']),
      'b=3; c=4'
    );
  });
});

