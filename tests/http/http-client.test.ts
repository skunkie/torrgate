// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { AxiosAdapter } from 'axios';

import { buildProxyUrl, HttpClient, mergeCookieHeader } from '../../src/http/http-client.js';
import { RequestThrottle } from '../../src/http/request-throttle.js';

describe('HttpClient request scheduling', () => {
  it('should space request starts after contention for HTTP slots', async context => {
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
    const settle = async (): Promise<void> => {
      for (let round = 0; round < 10; round++) {
        await new Promise(resolve => setImmediate(resolve));
      }
    };
    const httpClient = new HttpClient(undefined, 10000, 1);
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>(resolve => { releaseBlocker = resolve; });
    const requestTimes: number[] = [];
    const adapter: AxiosAdapter = async config => {
      if (config.url?.endsWith('/blocker')) {
        await blocker;
      } else {
        requestTimes.push(Date.now());
      }
      return { config, data: Buffer.from('Sample response'), headers: {}, status: 200, statusText: 'OK' };
    };
    const options = { adapter, requestThrottle: new RequestThrottle(2_000) };
    const requests = Promise.all([
      httpClient.getDecoded('https://tracker.example/blocker', 'utf-8', { adapter }),
      httpClient.getBinary('https://tracker.example/binary', options),
      httpClient.getDecoded('https://tracker.example/decoded', 'utf-8', options),
      httpClient.getKeepingCookies('https://tracker.example/cookies', 'utf-8', options),
      httpClient.requestDecoded('https://tracker.example/request', options),
      httpClient.postForm('https://tracker.example/form', { query: 'Sample' }, 'utf-8', options),
    ]);
    await settle();
    context.mock.timers.tick(6_000);
    await settle();
    assert.deepEqual(requestTimes, []);

    releaseBlocker();
    await settle();
    assert.deepEqual(requestTimes, [7_000]);
    for (let index = 1; index < 5; index++) {
      context.mock.timers.tick(2_000);
      await settle();
      assert.equal(requestTimes.length, index + 1);
    }
    await requests;
    assert.deepEqual(requestTimes, [7_000, 9_000, 11_000, 13_000, 15_000]);
  });
});

describe('HttpClient', () => {
  let baseUrl: string;
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      if (req.url === '/test-user-agent') {
        res.end(req.headers['user-agent']);
      } else if (req.url === '/test-status-403' && req.method === 'GET') {
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
      } else if (req.url === '/test-timeout' && req.method === 'GET') {
        req.resume();
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

  it('should send the prefixed User-Agent setting', async () => {
    const originalEnv = { ...process.env };
    process.env.TORRGATE_USER_AGENT = 'SampleTrackerClient/1.0';
    try {
      assert.equal(await new HttpClient().getDecoded(`${baseUrl}/test-user-agent`), 'SampleTrackerClient/1.0');
    } finally {
      process.env = originalEnv;
    }
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

  it('should preserve repeated form fields while transcoding windows-1251 values', async () => {
    const form = new URLSearchParams([['f[]', '11'], ['f[]', '22'], ['nm', 'Тест']]);
    const response = await new HttpClient().postForm(`${baseUrl}/test-form-win1251`, form, 'windows-1251');
    assert.equal(response.content, 'f%5B%5D=11&f%5B%5D=22&nm=%D2%E5%F1%F2');
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

  it('should time out stalled requests and release their concurrency slots', { timeout: 5000 }, async () => {
    const timeoutMs = 100;
    const httpClient = new HttpClient(undefined, timeoutMs, 1);
    for (const request of [
      () => httpClient.getDecoded(`${baseUrl}/test-timeout`),
      () => httpClient.getBinary(`${baseUrl}/test-timeout`),
    ]) {
      await assert.rejects(request, { code: 'ECONNABORTED' });
      assert.equal(await httpClient.getDecoded(`${baseUrl}/test-status-200`, 'utf-8', { timeout: 1000 }), 'OK Success');
    }
  });

  it('should initialize with proxy configuration when provided', () => {
    const proxyClient = new HttpClient({
      password: 'proxypassword',
      url: 'http://proxyuser:proxypassword@127.0.0.1:8080',
      username: 'proxyuser',
    });
    assert.ok(proxyClient);
  });
});

describe('HttpClient outbound proxy', () => {
  let testProxyServer: http.Server;
  let proxyUrl: string;
  const receivedRequests: string[] = [];

  before(async () => {
    testProxyServer = http.createServer((req, res) => {
      receivedRequests.push(`${req.method} ${req.url}`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>proxied sample page</html>');
    });
    testProxyServer.on('connect', (req, socket) => {
      receivedRequests.push(`CONNECT ${req.url}`);
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    });
    await new Promise<void>(resolve => {
      testProxyServer.listen(0, '127.0.0.1', () => {
        proxyUrl = `http://127.0.0.1:${(testProxyServer.address() as { port: number }).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => testProxyServer.close(() => resolve()));
  });

  it('should forward plain-HTTP requests as absolute URIs instead of CONNECT tunnels', async () => {
    const proxyClient = new HttpClient({ url: proxyUrl }, 2000);

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
      } else if (url.pathname === '/leave-and-return.php') {
        res.writeHead(302, { 'Location': `${otherHostUrl}/return.php`, 'Set-Cookie': 'bb_session=sample-session; path=/' });
        res.end();
      } else if (url.pathname === '/return.php') {
        res.writeHead(302, {
          'Location': `${testServerUrl}/home.php`,
          'Set-Cookie': ['bb_session=foreign-session; path=/', 'external=sample-external; path=/'],
        });
        res.end();
      } else if (url.pathname === '/landing.php') {
        res.writeHead(200, { 'Set-Cookie': 'external=sample-external; path=/' });
        res.end('<html>Sample landing page</html>');
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
    const response = await new HttpClient().postForm(`${testServerUrl}/leave.php`, { login_username: 'sample-user' });
    assert.equal(cookiesSeenByHop['/landing.php'], '');
    assert.deepEqual(response.cookies, ['bb_session=sample-session; path=/']);
  });

  it('should preserve tracker cookies when a redirect returns from another host', async () => {
    const response = await new HttpClient().postForm(`${testServerUrl}/leave-and-return.php`, { login_username: 'sample-user' });
    assert.equal(cookiesSeenByHop['/return.php'], '');
    assert.equal(cookiesSeenByHop['/home.php'], 'bb_session=sample-session');
    assert.deepEqual(response.cookies, ['bb_session=sample-session; path=/']);
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

describe('HttpClient concurrency configuration', () => {
  it('should share the configured limit across binary and decoded requests', async () => {
    const httpClient = new HttpClient(undefined, 10000, 2);
    let activeRequests = 0;
    let peakRequests = 0;
    const adapter: AxiosAdapter = async config => {
      activeRequests++;
      peakRequests = Math.max(peakRequests, activeRequests);
      await new Promise(resolve => setTimeout(resolve, 20));
      activeRequests--;
      return {
        config,
        data: Buffer.from('Sample response'),
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    };

    const responses = await Promise.all([
      httpClient.getDecoded('https://first.example/page', 'utf-8', { adapter }),
      httpClient.getBinary('https://second.example/torrent', { adapter }),
      httpClient.requestDecoded('https://third.example/page', { adapter }),
      httpClient.getKeepingCookies('https://fourth.example/page', 'utf-8', { adapter }),
    ]);
    assert.equal(responses.length, 4);
    assert.equal(peakRequests, 2);
    assert.equal(activeRequests, 0);
  });

  it('should reject an invalid limit when constructed directly', () => {
    assert.throws(() => new HttpClient(undefined, 10000, 0), /positive safe integer/);
  });
});

describe('buildProxyUrl', () => {
  it('should add configured credentials to a proxy URL that has none', () => {
    assert.equal(
      buildProxyUrl({ password: 'p@ss:word', url: 'http://proxy.example.test:8080', username: 'sample user' }),
      'http://sample%20user:p%40ss%3Aword@proxy.example.test:8080/'
    );
    assert.equal(
      buildProxyUrl({ url: 'http://proxy.example.test:8080', username: 'sample-user' }),
      'http://sample-user@proxy.example.test:8080/'
    );
  });

  it('should keep credentials the proxy URL already carries', () => {
    assert.equal(
      buildProxyUrl({ password: 'other', url: 'http://url-user:url-pass@proxy.example.test:8080/', username: 'other' }),
      'http://url-user:url-pass@proxy.example.test:8080/'
    );
  });
});
