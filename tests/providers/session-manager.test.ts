// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { SessionManager } from '../../src/providers/session-manager.js';
import { CardigannDefinition } from '../../src/providers/types.js';
import { RequestThrottle } from '../../src/utils/limiter.js';

describe('SessionManager', () => {
  let baseUrl: string;
  let testAuthHits: number;
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      if (req.url === '/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          if (body.includes('baduser')) {
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Set-Cookie': ['temp_sess=bad_sess_123; Path=/'],
            });
            res.end('<html><body><div class="error">Invalid username</div></body></html>');
          } else {
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Set-Cookie': ['session_id=sample_session_12345; Path=/', 'uid=999; Path=/'],
            });
            res.end('<html><body><div>Welcome</div></body></html>');
          }
        });
      } else if (req.url === '/test-auth' && req.method === 'GET') {
        testAuthHits += 1;
        const cookies = req.headers.cookie || '';
        if (cookies.includes('session_id=sample_session_12345')) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><a href="?cmd=logout">Logout</a></body></html>');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><a href="/login">Login</a></body></html>');
        }
      } else if (req.url === '/test-auth-unavailable' && req.method === 'GET') {
        testAuthHits += 1;
        res.writeHead(503);
        res.end();
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

  beforeEach(() => {
    testAuthHits = 0;
  });

  after(async () => {
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('should store and format cookies correctly', () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    sessionManager.setCookies([
      'bb_session=sample_val_1; Path=/',
      'bb_data=sample_val_2; Path=/',
    ]);

    const cookieHeader = sessionManager.getCookieHeader();
    assert.ok(cookieHeader.includes('bb_session=sample_val_1'));
    assert.ok(cookieHeader.includes('bb_data=sample_val_2'));

    sessionManager.invalidate();
    assert.equal(sessionManager.getCookieHeader(), '');
  });

  it('should parse compound cookie strings without dropping secondary cookies', () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    sessionManager.setCookies(['uid=12345; pass=abcdef012345; Path=/; HttpOnly']);

    const cookieHeader = sessionManager.getCookieHeader();
    assert.ok(cookieHeader.includes('uid=12345'));
    assert.ok(cookieHeader.includes('pass=abcdef012345'));
    assert.equal(cookieHeader.includes('Path'), false);
    assert.equal(cookieHeader.includes('HttpOnly'), false);
  });

  it('should authenticate and extract cookies on successful login', async () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      login: {
        error: [{ selector: 'div.error' }],
        inputs: {
          password: 'sample_password',
          username: 'sample_user',
        },
        method: 'post',
        path: '/login',
      },
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    const success = await sessionManager.ensureAuthenticated(baseUrl);

    assert.equal(success, true);
    assert.equal(sessionManager.hasSession(), true);
    const cookieHeader = sessionManager.getCookieHeader();
    assert.ok(cookieHeader.includes('session_id=sample_session_12345'));
    assert.ok(cookieHeader.includes('uid=999'));
  });

  it('should return false and not leak cookies when login error selector is encountered', async () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      login: {
        error: [{ selector: 'div.error' }],
        inputs: {
          password: 'sample_password',
          username: 'baduser',
        },
        method: 'post',
        path: '/login',
      },
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    const success = await sessionManager.ensureAuthenticated(baseUrl);

    assert.equal(success, false);
    assert.equal(sessionManager.hasSession(), false);
    assert.equal(sessionManager.getCookieHeader(), '');
  });

  it('should verify session liveness using testSession', async () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      login: {
        method: 'post',
        path: '/login',
        test: {
          path: '/test-auth',
          selector: 'a[href$="cmd=logout"]',
        },
      },
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    // 1. Without session -> testSession returns false
    const withoutSession = await sessionManager.testSession(baseUrl);
    assert.equal(withoutSession, false);

    // 2. With valid session cookie -> testSession returns true
    sessionManager.setCookies(['session_id=sample_session_12345; Path=/']);
    const withSession = await sessionManager.testSession(baseUrl);
    assert.equal(withSession, true);

    // 3. With invalid session cookie -> testSession returns false and invalidates
    sessionManager.setCookies(['session_id=expired_session; Path=/']);
    const withExpired = await sessionManager.testSession(baseUrl);
    assert.equal(withExpired, false);
    assert.equal(sessionManager.hasSession(), false);
  });

  it('should return false without sending request when credentials are required but missing', async () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: [baseUrl],
      login: {
        inputs: {
          password: '{{ .Config.password }}',
          username: '{{ .Config.username }}',
        },
        method: 'post',
        path: '/login',
      },
      name: 'UnconfiguredTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    const success = await sessionManager.ensureAuthenticated(baseUrl);
    assert.equal(success, false);
    assert.equal(sessionManager.hasSession(), false);
  });

  it('should return false and clear state when network request fails during login', async () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: ['http://127.0.0.1:1'], // Non-existent connection endpoint
      login: {
        inputs: {
          password: 'sample_password',
          username: 'sample_user',
        },
        method: 'post',
        path: '/login',
      },
      name: 'FailingTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    const sessionManager = new SessionManager(definition, httpClient);
    const success = await sessionManager.ensureAuthenticated('http://127.0.0.1:1');
    assert.equal(success, false);
    assert.equal(sessionManager.hasSession(), false);
  });

  it('should not mark the session authenticated when an env cookie has no valid key=value pairs', () => {
    process.env.TORRGATE_SAMPLETRACKER_COOKIE = 'not-a-valid-cookie-value';

    try {
      const httpClient = new HttpClient();
      const definition: CardigannDefinition = {
        links: [baseUrl],
        name: 'SampleTracker',
        search: {
          fields: {},
          paths: [{ path: '/' }],
          rows: { selector: 'tr' },
        },
      };

      const sessionManager = new SessionManager(definition, httpClient);
      assert.equal(sessionManager.hasSession(), false);
      assert.equal(sessionManager.getCookieHeader(), '');
    } finally {
      delete process.env.TORRGATE_SAMPLETRACKER_COOKIE;
    }
  });

  it('should verify an env cookie against the tracker once via ensureSessionValid and cache the result', async () => {
    process.env.TORRGATE_SAMPLETRACKER_COOKIE = 'session_id=sample_session_12345';

    try {
      const httpClient = new HttpClient();
      const definition: CardigannDefinition = {
        links: [baseUrl],
        login: {
          method: 'post',
          path: '/login',
          test: {
            path: '/test-auth',
            selector: 'a[href$="cmd=logout"]',
          },
        },
        name: 'SampleTracker',
        search: {
          fields: {},
          paths: [{ path: '/' }],
          rows: { selector: 'tr' },
        },
      };

      const sessionManager = new SessionManager(definition, httpClient);

      const first = await sessionManager.ensureSessionValid(baseUrl);
      assert.equal(first, true);
      assert.equal(testAuthHits, 1);

      // A second call must not hit the tracker again once the env cookie has been verified.
      const second = await sessionManager.ensureSessionValid(baseUrl);
      assert.equal(second, true);
      assert.equal(testAuthHits, 1);
    } finally {
      delete process.env.TORRGATE_SAMPLETRACKER_COOKIE;
    }
  });

  it('should keep an env cookie when the session check cannot reach the tracker', async () => {
    process.env.TORRGATE_SAMPLETRACKER_COOKIE = 'session_id=sample_session_12345';

    try {
      const definition: CardigannDefinition = {
        links: [baseUrl],
        login: {
          method: 'post',
          path: '/login',
          test: {
            path: '/test-auth-unavailable',
            selector: 'a[href$="cmd=logout"]',
          },
        },
        name: 'SampleTracker',
        search: {
          fields: {},
          paths: [{ path: '/' }],
          rows: { selector: 'tr' },
        },
      };

      const sessionManager = new SessionManager(definition, new HttpClient());

      assert.equal(await sessionManager.ensureSessionValid(baseUrl), true);
      assert.equal(sessionManager.getCookieHeader(), 'session_id=sample_session_12345');
      assert.equal(sessionManager.hasLoginCredentials(), true);

      assert.equal(await sessionManager.ensureSessionValid(baseUrl), true);
      assert.equal(testAuthHits, 2);
    } finally {
      delete process.env.TORRGATE_SAMPLETRACKER_COOKIE;
    }
  });

  it('should discard a rejected env cookie and fall back to username/password login', async () => {
    process.env.TORRGATE_SAMPLETRACKER_COOKIE = 'session_id=expired_session';

    try {
      const httpClient = new HttpClient();
      const definition: CardigannDefinition = {
        links: [baseUrl],
        login: {
          error: [{ selector: 'div.error' }],
          inputs: {
            password: 'sample_password',
            username: 'sample_user',
          },
          method: 'post',
          path: '/login',
          test: {
            path: '/test-auth',
            selector: 'a[href$="cmd=logout"]',
          },
        },
        name: 'SampleTracker',
        search: {
          fields: {},
          paths: [{ path: '/' }],
          rows: { selector: 'tr' },
        },
      };

      const sessionManager = new SessionManager(definition, httpClient);

      const success = await sessionManager.ensureSessionValid(baseUrl);
      assert.equal(success, true);

      const cookieHeader = sessionManager.getCookieHeader();
      assert.ok(cookieHeader.includes('session_id=sample_session_12345'));
      assert.equal(cookieHeader.includes('expired_session'), false);
    } finally {
      delete process.env.TORRGATE_SAMPLETRACKER_COOKIE;
    }
  });

  it('should delete cookie from jar when Set-Cookie has Max-Age=0', () => {
    const httpClient = new HttpClient();
    const definition: CardigannDefinition = {
      links: ['https://example.org'],
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };
    const sessionManager = new SessionManager(definition, httpClient);

    // Initial cookie set
    sessionManager.setCookies(['bb_session=active_token_123; Path=/; Priority=High']);
    assert.ok(sessionManager.getCookieHeader().includes('bb_session=active_token_123'));
    assert.equal(sessionManager.getCookieHeader().includes('Priority'), false);

    // Deletion via Max-Age=0
    sessionManager.setCookies(['bb_session=deleted; Max-Age=0; Path=/']);
    assert.equal(sessionManager.getCookieHeader().includes('bb_session'), false);
  });

  it('should space login and session-check requests by the tracker request delay', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
    try {
      const requestTimes: string[] = [];
      const testHttpClient = {
        getDecoded: async () => {
          requestTimes.push(`test@${Date.now()}`);
          return '<html><body><a href="?cmd=logout">Logout</a></body></html>';
        },
        postForm: async () => {
          requestTimes.push(`login@${Date.now()}`);
          return { content: '<html><body>Welcome</body></html>', cookies: ['uid=123'] };
        },
      } as unknown as HttpClient;
      const definition: CardigannDefinition = {
        links: ['https://example.org'],
        login: {
          path: 'login.php',
          test: { path: 'index.php', selector: 'a[href$="cmd=logout"]' },
        },
        name: 'SampleTracker',
        search: {
          fields: {},
          paths: [{ path: '/' }],
          rows: { selector: 'tr' },
        },
      };
      const sessionManager = new SessionManager(definition, testHttpClient, new RequestThrottle(2_000));

      assert.equal(await sessionManager.ensureAuthenticated('https://example.org'), true);
      const sessionCheck = sessionManager.testSession('https://example.org');
      mock.timers.tick(2_000);

      assert.equal(await sessionCheck, true);
      assert.deepEqual(requestTimes, ['login@1000', 'test@3000']);
    } finally {
      mock.timers.reset();
    }
  });

  it('should deduplicate concurrent login requests', async () => {
    let postFormCalls = 0;
    const testHttpClient = {
      postForm: async () => {
        postFormCalls += 1;
        await new Promise(r => setTimeout(r, 20));
        return {
          content: '<html><body>Success</body></html>',
          cookies: ['uid=123', 'pass=abc'],
        };
      },
    } as unknown as HttpClient;

    const definition: CardigannDefinition = {
      links: ['https://example.org'],
      login: {
        inputs: {
          password: '{{ .Config.password }}',
          username: '{{ .Config.username }}',
        },
        path: 'login.php',
      },
      name: 'SampleTracker',
      search: {
        fields: {},
        paths: [{ path: '/' }],
        rows: { selector: 'tr' },
      },
    };

    process.env.TORRGATE_SAMPLETRACKER_USERNAME = 'user';
    process.env.TORRGATE_SAMPLETRACKER_PASSWORD = 'pass';

    try {
      const sessionManager = new SessionManager(definition, testHttpClient);
      const [res1, res2, res3] = await Promise.all([
        sessionManager.ensureAuthenticated('https://example.org'),
        sessionManager.ensureAuthenticated('https://example.org'),
        sessionManager.ensureAuthenticated('https://example.org'),
      ]);

      assert.equal(res1, true);
      assert.equal(res2, true);
      assert.equal(res3, true);
      assert.equal(postFormCalls, 1);
    } finally {
      delete process.env.TORRGATE_SAMPLETRACKER_USERNAME;
      delete process.env.TORRGATE_SAMPLETRACKER_PASSWORD;
    }
  });
});

