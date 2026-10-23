// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { INITIAL_LOGIN_RETRY_DELAY_MS, SessionManager } from '../../../src/providers/cardigann/session-manager.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

const loginPageHtml = '<html><body><form action="/login"><input name="username"></form></body></html>';

const resultsHtml = `
  <html><body><table>
    <tr class="row"><td class="title"><a href="/details.php?id=1">Example Release 2026</a></td></tr>
  </table></body></html>
`;

const sampleTorrent = 'd8:announce30:http://tracker.example.org/ann4:infod4:name14:Example Releaseee';

const emptyResultsHtml = '<html><body><a href="/logout">Logout</a><table></table></body></html>';

describe('Tracker session recovery', () => {
  let baseUrl: string;
  let currentSessionToken: string;
  let isLoginRejected: boolean;
  let loginCount: number;
  let testPageHits: number;
  let testServer: http.Server;
  let trackerRequestCount: number;

  const hasValidSession = (req: http.IncomingMessage): boolean =>
    (req.headers.cookie || '').includes(`sess=${currentSessionToken}`);

  before(async () => {
    process.env.TORRGATE_RECOVERYTRACKER_USERNAME = 'sample-user';
    process.env.TORRGATE_RECOVERYTRACKER_PASSWORD = 'sample-pass';

    testServer = http.createServer((req, res) => {
      trackerRequestCount += 1;
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname === '/login' && req.method === 'POST') {
        req.resume();
        req.on('end', () => {
          loginCount += 1;
          if (isLoginRejected) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(loginPageHtml);
            return;
          }
          currentSessionToken = `token-${loginCount}`;
          res.writeHead(302, {
            'Location': '/welcome',
            'Set-Cookie': [`sess=${currentSessionToken}; Path=/`],
          });
          res.end();
        });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (url.pathname === '/index.php') {
        testPageHits += 1;
        res.end(hasValidSession(req) ? '<a href="/logout">Logout</a>' : loginPageHtml);
      } else if (url.pathname === '/details.php') {
        res.end(hasValidSession(req)
          ? '<a href="/logout">Logout</a><h1>Example Release 2026</h1><a href="download.php?id=1">Download</a>'
          : loginPageHtml);
      } else if (url.pathname === '/download.php') {
        res.end(hasValidSession(req) ? sampleTorrent : loginPageHtml);
      } else if (url.pathname === '/search') {
        if (!hasValidSession(req)) {
          res.end(loginPageHtml);
        } else if (url.searchParams.get('q') === 'nothing') {
          res.end(emptyResultsHtml);
        } else {
          res.end(resultsHtml);
        }
      } else {
        res.end('');
      }
    });

    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    currentSessionToken = 'none';
    isLoginRejected = false;
    loginCount = 0;
    testPageHits = 0;
    trackerRequestCount = 0;
  });

  after(async () => {
    delete process.env.TORRGATE_RECOVERYTRACKER_USERNAME;
    delete process.env.TORRGATE_RECOVERYTRACKER_PASSWORD;
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  const createDefinition = (): CardigannDefinition => ({
    id: 'recoverytracker',
    links: [baseUrl],
    login: {
      inputs: {
        password: '{{ .Config.password }}',
        username: '{{ .Config.username }}',
      },
      method: 'post',
      path: 'login',
      test: { path: 'index.php', selector: 'a[href="/logout"]' },
    },
    name: 'Recovery Tracker',
    search: {
      fields: {
        details: { attribute: 'href', selector: 'td.title a' },
        title: { selector: 'td.title' },
      },
      inputs: { q: '{{ .Keywords }}' },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  });

  it('should log in again and retry the search when the tracker session has expired', async () => {
    const provider = new CardigannProvider(createDefinition(), new HttpClient());

    const firstResults = await provider.searchByTitle({ query: 'example' });
    assert.equal(firstResults.length, 1);
    assert.equal(loginCount, 1);

    currentSessionToken = 'expired-on-tracker';

    const retriedResults = await provider.searchByTitle({ query: 'example' });
    assert.equal(retriedResults.length, 1);
    assert.equal(retriedResults[0].name, 'Example Release 2026');
    assert.equal(loginCount, 2);
  });

  it('should trust an empty result page that still shows the session without an extra check', async () => {
    const provider = new CardigannProvider(createDefinition(), new HttpClient());
    await provider.searchByTitle({ query: 'example' });

    const results = await provider.searchByTitle({ query: 'nothing' });
    assert.deepEqual(results, []);
    assert.equal(loginCount, 1);
    assert.equal(testPageHits, 0);
  });

  it('should log in again when a topic details page no longer shows the session', async () => {
    const provider = new CardigannProvider(createDefinition(), new HttpClient());
    await provider.searchByTitle({ query: 'example' });
    currentSessionToken = 'expired-on-tracker';

    const details = await provider.getTopicDetails('1');
    assert.equal(details?.name, 'Example Release 2026');
    assert.equal(loginCount, 2);
  });

  it('should log in again and retry when a download returns a login page', async () => {
    const provider = new CardigannProvider(createDefinition(), new HttpClient());
    await provider.searchByTitle({ query: 'example' });
    currentSessionToken = 'expired-on-tracker';

    const torrentFile = await provider.downloadTorrent(`${baseUrl}download.php?id=1`);
    assert.equal(torrentFile.data.toString('utf8'), sampleTorrent);
    assert.equal(loginCount, 2);
  });

  it('should explain which variables to set when a tracker needs an account that is not configured', async () => {
    delete process.env.TORRGATE_RECOVERYTRACKER_USERNAME;
    try {
      const provider = new CardigannProvider(createDefinition(), new HttpClient());
      await assert.rejects(
        provider.searchByTitle({ query: 'example' }),
        /requires an account: set TORRGATE_RECOVERYTRACKER_USERNAME and TORRGATE_RECOVERYTRACKER_PASSWORD, or TORRGATE_RECOVERYTRACKER_COOKIE/
      );
    } finally {
      process.env.TORRGATE_RECOVERYTRACKER_USERNAME = 'sample-user';
    }
  });

  it('should throw instead of reporting zero results when logging in again fails', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      const provider = new CardigannProvider(createDefinition(), new HttpClient());
      await provider.searchByTitle({ query: 'example' });

      currentSessionToken = 'expired-on-tracker';
      isLoginRejected = true;

      await assert.rejects(
        provider.searchByTitle({ query: 'example' }),
        /Recovery Tracker rejected the login session/
      );
      assert.equal(provider.sessionManager.hasSession(), false);
      assert.equal(provider.sessionManager.getCookieHeader(), '');

      isLoginRejected = false;
      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      assert.equal((await provider.searchByTitle({ query: 'example' })).length, 1);
      assert.equal(loginCount, 3);
    } finally {
      mock.timers.reset();
    }
  });

  it('should hold off further logins after a failed one instead of logging in with every search', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      const provider = new CardigannProvider(createDefinition(), new HttpClient());
      isLoginRejected = true;

      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);
      const loginsAfterFailure = loginCount;
      const requestsAfterFailure = trackerRequestCount;
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);
      await assert.rejects(provider.getTopicDetails('1'), /next login attempt is held until/);
      await assert.rejects(provider.downloadTorrent(`${baseUrl}download.php?id=1`), /next login attempt is held until/);
      assert.equal(loginCount, loginsAfterFailure);
      assert.equal(trackerRequestCount, requestsAfterFailure);

      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /rejected the login session/);
      assert.ok(loginCount > loginsAfterFailure);

      const loginsAfterSecondFailure = loginCount;
      isLoginRejected = false;
      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);
      assert.equal(loginCount, loginsAfterSecondFailure);

      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      assert.equal((await provider.searchByTitle({ query: 'example' })).length, 1);
      assert.equal(provider.sessionManager.loginRetryAt, undefined);
    } finally {
      mock.timers.reset();
    }
  });

  it('should start again from the shortest login wait once a new session is confirmed', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      const provider = new CardigannProvider(createDefinition(), new HttpClient());
      isLoginRejected = true;
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);
      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);

      isLoginRejected = false;
      mock.timers.tick(2 * INITIAL_LOGIN_RETRY_DELAY_MS);
      assert.equal((await provider.searchByTitle({ query: 'example' })).length, 1);

      currentSessionToken = 'expired-on-tracker';
      isLoginRejected = true;
      await assert.rejects(provider.searchByTitle({ query: 'example' }), /next login attempt is held until/);
      const retryAt = provider.sessionManager.loginRetryAt;
      assert.equal(retryAt?.getTime(), Date.now() + INITIAL_LOGIN_RETRY_DELAY_MS);
    } finally {
      mock.timers.reset();
    }
  });

  it('should ask only for a session cookie when the definition signs in with cookies', async () => {
    const definition = createDefinition();
    definition.id = 'cookieonlytracker';
    definition.login = { ...definition.login, method: 'cookie' };
    const provider = new CardigannProvider(definition, new HttpClient());

    await assert.rejects(
      provider.searchByTitle({ query: 'example' }),
      /^TrackerSessionError: Tracker Recovery Tracker requires a browser session cookie: set TORRGATE_COOKIEONLYTRACKER_COOKIE$/
    );
    assert.equal(loginCount, 0);
  });

  it('should share one re-login between concurrent searches that hit an expired session', async () => {
    const provider = new CardigannProvider(createDefinition(), new HttpClient());
    await provider.searchByTitle({ query: 'example' });
    currentSessionToken = 'expired-on-tracker';

    const outcomes = await Promise.all([
      provider.searchByTitle({ query: 'example' }),
      provider.searchByTitle({ query: 'example' }),
      provider.searchByTitle({ query: 'example' }),
    ]);

    for (const results of outcomes) {
      assert.equal(results.length, 1);
    }
    assert.equal(loginCount, 2);
  });

  it('should treat an unreachable test page as a valid session rather than logging in again', async () => {
    const httpClient = new HttpClient();
    const sessionManager = new SessionManager(createDefinition(), httpClient);
    sessionManager.setCookies(['sess=sample-session']);
    httpClient.getDecoded = async () => {
      throw new Error('Connection reset by sample tracker');
    };

    assert.equal(await sessionManager.recoverSession(baseUrl), 'valid');
    assert.ok(sessionManager.hasSession());
  });
});

describe('Cardigann search error pages and paging', () => {
  const baseDefinition: CardigannDefinition = {
    links: ['https://tracker.example.org/'],
    name: 'Sample Tracker',
    search: {
      fields: { title: { selector: 'td.title' } },
      inputs: { q: '{{ .Keywords }}' },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  it('should throw with the error text when a search.error selector matches', async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => '<html><body><div class="error">Search is temporarily disabled</div></body></html>';
    const provider = new CardigannProvider(
      { ...baseDefinition, search: { ...baseDefinition.search, error: [{ selector: 'div.error' }] } },
      httpClient
    );

    await assert.rejects(
      provider.searchByTitle({ query: 'example' }),
      /Sample Tracker returned an error page: Search is temporarily disabled/
    );
  });

});

describe('Cardigann category requests', () => {
  const categoryDefinition: CardigannDefinition = {
    caps: {
      categorymappings: [
        { cat: 'Movies', desc: 'Sample Films', id: 11 },
        { cat: 'TV', desc: 'Sample Series', id: 21 },
        { cat: 'TV/Anime', desc: 'Sample Animation', id: 22 },
      ],
    },
    links: ['https://tracker.example.org/'],
    name: 'Category Tracker',
    search: {
      fields: {
        category: { attribute: 'data-cat', selector: 'td.title' },
        title: { selector: 'td.title' },
      },
      inputs: { f: '{{ if .Query.Category }}{{ .Query.Category }}{{ else }}-1{{ end }}', q: '{{ .Keywords }}' },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  const mixedResultsHtml = `
    <table>
      <tr class="row"><td class="title" data-cat="11">Example Film 2026</td></tr>
      <tr class="row"><td class="title" data-cat="21">Sample Show S01E02</td></tr>
      <tr class="row"><td class="title" data-cat="22">Sample Animation S01</td></tr>
    </table>
  `;

  const createProvider = () => {
    const httpClient = new HttpClient();
    const fetchedUrls: string[] = [];
    httpClient.getDecoded = async (url: string) => {
      fetchedUrls.push(url);
      return mixedResultsHtml;
    };
    return { fetchedUrls, provider: new CardigannProvider(categoryDefinition, httpClient) };
  };

  it('should pass the tracker category when a request maps to exactly one', async () => {
    const { fetchedUrls, provider } = createProvider();
    const results = await provider.searchByTitle({ categories: [2000], query: 'example' });
    assert.match(fetchedUrls[0], /[?&]f=11(&|$)/);
    assert.deepEqual(results.map(r => r.name), ['Example Film 2026']);
  });

  it('should search unfiltered and filter results when a request spans several tracker categories', async () => {
    const { fetchedUrls, provider } = createProvider();
    const results = await provider.searchByTitle({ categories: [5000], query: 'sample' });
    assert.match(fetchedUrls[0], /[?&]f=-1(&|$)/);
    assert.deepEqual(results.map(r => r.name), ['Sample Show S01E02', 'Sample Animation S01']);
  });

  it('should skip the request when no tracker category matches', async () => {
    const { fetchedUrls, provider } = createProvider();
    assert.deepEqual(await provider.searchByTitle({ categories: [7000], query: 'sample' }), []);
    assert.equal(fetchedUrls.length, 0);
  });

  it('should URL-encode keywords that the definition places in the path', async () => {
    const httpClient = new HttpClient();
    let fetchedUrl = '';
    httpClient.getDecoded = async (url: string) => {
      fetchedUrl = url;
      return mixedResultsHtml;
    };
    const provider = new CardigannProvider(
      { ...categoryDefinition, search: { ...categoryDefinition.search, inputs: {}, paths: [{ path: 'search/{{ .Keywords }}' }] } },
      httpClient
    );

    await provider.searchByTitle({ query: 'Sample C# Guide?' });
    assert.equal(fetchedUrl, 'https://tracker.example.org/search/Sample%20C%23%20Guide%3F');
  });
});
