// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { SessionManager } from '../../../src/providers/cardigann/session-manager.js';
import { CardigannDefinition, CardigannLogin } from '../../../src/providers/cardigann/types.js';

const testActionlessLoginPage = `
  <html><body>
    <form>
      <select name="region"><option>Europe</option><option value="asia">Asia</option></select>
      <textarea name="note">Sample note</textarea>
    </form>
  </body></html>`;

const testLoginPage = `
  <html><body>
    <form id="search" action="/search"><input name="q" value="ignored"></form>
    <form id="login" action="/takelogin" method="post">
      <input type="hidden" name="csrf" value="sample-token">
      <input name="username" value="">
      <input type="password" name="password">
      <input type="checkbox" name="remember" value="1" checked>
      <input type="checkbox" name="newsletter" value="1">
      <select name="lang"><option value="en">English</option><option value="ru" selected>Русский</option></select>
      <input type="submit" name="go" value="Sign in">
    </form>
  </body></html>`;

describe('Login methods', () => {
  let baseUrl: string;
  let receivedRequests: Array<{ body: string; cookie: string; method: string; url: string }>;
  let testServer: http.Server;

  before(async () => {
    process.env.TORRGATE_LOGINTRACKER_USERNAME = 'sample-user';
    process.env.TORRGATE_LOGINTRACKER_PASSWORD = 'sample-pass';

    testServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({ body, cookie: req.headers.cookie || '', method: req.method || '', url: req.url || '' });
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname === '/login.php' && req.method === 'GET' && url.searchParams.has('username')) {
          res.writeHead(302, { 'Location': '/welcome', 'Set-Cookie': 'sess=from-get; Path=/' });
          res.end();
        } else if (url.pathname === '/plain-login.php' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(testActionlessLoginPage);
        } else if (url.pathname === '/login.php' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'pre=page-cookie; Path=/' });
          res.end(testLoginPage);
        } else if (url.pathname === '/takelogin' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'sess=from-form; Path=/' });
          res.end('<html><body>Welcome</body></html>');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>Welcome</body></html>');
        }
      });
    });
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/`;
  });

  beforeEach(() => {
    receivedRequests = [];
  });

  after(async () => {
    delete process.env.TORRGATE_LOGINTRACKER_USERNAME;
    delete process.env.TORRGATE_LOGINTRACKER_PASSWORD;
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  const createDefinition = (login: CardigannLogin): CardigannDefinition => ({
    id: 'logintracker',
    links: [baseUrl],
    login,
    name: 'Login Tracker',
    search: { fields: {}, paths: [{ path: '/' }], rows: { selector: 'tr' } },
  });

  it('should send get logins as a query string and keep cookies set before a redirect', async () => {
    const sessionManager = new SessionManager(createDefinition({
      inputs: { password: '{{ .Config.password }}', username: '{{ .Config.username }}' },
      method: 'get',
      path: 'login.php?do=login',
    }), new HttpClient());

    assert.equal(await sessionManager.ensureAuthenticated(baseUrl), true);
    assert.equal(receivedRequests[0].method, 'GET');
    assert.equal(receivedRequests[0].url, '/login.php?do=login&password=sample-pass&username=sample-user');
    assert.equal(sessionManager.getCookieHeader(), 'sess=from-get');
  });

  it('should submit the selected login form with its own fields and the definition inputs', async () => {
    const sessionManager = new SessionManager(createDefinition({
      form: 'form#login',
      inputs: { password: '{{ .Config.password }}', username: '{{ .Config.username }}' },
      method: 'form',
      path: 'login.php',
    }), new HttpClient());

    assert.equal(await sessionManager.ensureAuthenticated(baseUrl), true);
    const submission = receivedRequests.find(request => request.url === '/takelogin');
    assert.ok(submission);
    assert.equal(submission.method, 'POST');
    assert.equal(submission.cookie, 'pre=page-cookie');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(submission.body)), {
      csrf: 'sample-token',
      lang: 'ru',
      password: 'sample-pass',
      remember: '1',
      username: 'sample-user',
    });
    assert.equal(sessionManager.getCookieHeader(), 'pre=page-cookie; sess=from-form');
  });

  it('should submit textarea and default select values to submitpath or the login page itself', async () => {
    const createSessionManager = (submitpath?: string) => new SessionManager(createDefinition({
      inputs: { username: '{{ .Config.username }}' },
      method: 'form',
      path: 'plain-login.php',
      submitpath,
    }), new HttpClient());

    assert.equal(await createSessionManager('{{ .Config.sitelink }}takelogin').ensureAuthenticated(baseUrl), true);
    assert.equal(await createSessionManager().ensureAuthenticated(baseUrl), true);

    const submissions = receivedRequests.filter(request => request.method === 'POST');
    assert.deepEqual(submissions.map(request => request.url), ['/takelogin', '/plain-login.php']);
    for (const submission of submissions) {
      assert.deepEqual(Object.fromEntries(new URLSearchParams(submission.body)), {
        note: 'Sample note',
        region: 'Europe',
        username: 'sample-user',
      });
    }
  });

  it('should report a login page without the expected form', async () => {
    const sessionManager = new SessionManager(createDefinition({
      form: 'form#missing',
      method: 'form',
      path: 'login.php',
    }), new HttpClient());

    assert.equal(await sessionManager.ensureAuthenticated(baseUrl), false);
    assert.equal(sessionManager.loginError, "login page has no form matching 'form#missing'");
  });

  it('should require a configured cookie for cookie logins without sending a request', async () => {
    const sessionManager = new SessionManager(createDefinition({ method: 'cookie' }), new HttpClient());

    assert.equal(sessionManager.hasLoginCredentials(), false);
    assert.equal(await sessionManager.ensureAuthenticated(baseUrl), false);
    assert.match(sessionManager.loginError ?? '', /TORRGATE_LOGINTRACKER_COOKIE/);
    assert.equal(receivedRequests.length, 0);
  });

  it('should reject unsupported login methods without sending a request', async () => {
    const sessionManager = new SessionManager(
      createDefinition({ method: 'oneurl' as CardigannLogin['method'], path: 'login.php' }),
      new HttpClient()
    );

    assert.equal(await sessionManager.ensureAuthenticated(baseUrl), false);
    assert.equal(sessionManager.loginError, "unsupported login method 'oneurl'");
    assert.equal(receivedRequests.length, 0);
  });
});
