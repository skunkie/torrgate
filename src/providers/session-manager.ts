// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import * as cheerio from 'cheerio';

import { HttpClient } from '../http/http-client.js';
import { RequestThrottle } from '../utils/limiter.js';
import { renderTemplate } from './template.js';
import { CardigannDefinition, TemplateContext } from './types.js';

const COOKIE_DIRECTIVES = new Set([
  'domain',
  'expires',
  'httponly',
  'max-age',
  'partitioned',
  'path',
  'priority',
  'samesite',
  'secure',
]);

/**
 * Result of re-checking a session after a search returned no usable rows:
 * `valid` means the session is fine (or cannot be checked), `renewed` means a fresh
 * login replaced a rejected session, and `failed` means no working session could be established.
 */
export type SessionRecoveryOutcome = 'failed' | 'renewed' | 'valid';

/**
 * Manages tracker authentication, cookie jars, and session state.
 */
export class SessionManager {
  private readonly cookies: Map<string, string> = new Map();
  private readonly definition: CardigannDefinition;
  private readonly encoding: 'utf-8' | 'windows-1251';
  /** Set once an env-var cookie has been checked against the tracker and rejected, so it isn't retried. */
  private envCookieRejected: boolean = false;
  /** Whether the current session came from an env-var cookie that hasn't been checked against the live tracker yet. */
  private envCookieVerified: boolean = false;
  private readonly httpClient: HttpClient;
  private isAuthenticated: boolean = false;
  private pendingLogin: Promise<boolean> | null = null;
  private pendingRecovery: Promise<SessionRecoveryOutcome> | null = null;
  private pendingVerification: Promise<boolean> | null = null;
  /** Source of the current authenticated state, used to decide whether live verification is needed. */
  private sessionSource: 'cookie' | 'login' | null = null;

  constructor(
    definition: CardigannDefinition,
    httpClient: HttpClient,
    private readonly requestThrottle?: RequestThrottle
  ) {
    this.definition = definition;
    this.httpClient = httpClient;
    this.encoding =
      definition.encoding?.toLowerCase() === 'windows-1251' ? 'windows-1251' : 'utf-8';

    const providerId = this.getProviderId();
    const envCookie = process.env[`TORRGATE_${providerId}_COOKIE`];
    if (envCookie) {
      this.setCookies([envCookie]);
      // Only trust the env cookie if it actually parsed into at least one
      // usable name=value pair; a malformed/bare value must not silently
      // mark the session as authenticated.
      if (this.cookies.size > 0) {
        this.isAuthenticated = true;
        this.sessionSource = 'cookie';
      }
    }
  }

  /**
   * Ensures that the session is authenticated if the definition requires login.
   */
  async ensureAuthenticated(baseUrl: string): Promise<boolean> {
    const login = this.definition.login;
    if (!login || this.isAuthenticated) {
      return true;
    }

    if (this.pendingLogin) {
      return this.pendingLogin;
    }

    this.pendingLogin = this.performLogin(baseUrl).finally(() => {
      this.pendingLogin = null;
    });

    return this.pendingLogin;
  }

  private async performLogin(baseUrl: string): Promise<boolean> {
    const login = this.definition.login;
    if (!login) {
      return false;
    }

    const providerId = this.getProviderId();

    const envCookie = this.envCookieRejected
      ? undefined
      : process.env[`TORRGATE_${providerId}_COOKIE`];
    if (envCookie) {
      this.setCookies([envCookie]);
      if (this.cookies.size > 0) {
        this.isAuthenticated = true;
        this.sessionSource = 'cookie';
        return true;
      }
    }

    const username =
      process.env[`TORRGATE_${providerId}_USERNAME`] || process.env.TRACKER_USERNAME || '';
    const password =
      process.env[`TORRGATE_${providerId}_PASSWORD`] || process.env.TRACKER_PASSWORD || '';

    if (!login.path) {
      return false;
    }

    const requiresConfig = JSON.stringify(login.inputs || {}).includes('.Config.');
    if (requiresConfig && (!username || !password)) {
      return false;
    }

    const context: TemplateContext = {
      Config: {
        password,
        username,
      },
    };

    try {
      const loginUrl = new URL(renderTemplate(login.path, context), baseUrl).toString();
      const formData: Record<string, string> = {};

      if (login.inputs) {
        for (const [key, tmpl] of Object.entries(login.inputs)) {
          formData[key] = renderTemplate(String(tmpl), context);
        }
      }

      await this.requestThrottle?.acquire();
      const response = await this.httpClient.postForm(loginUrl, formData, this.encoding);

      if (login.error && login.error.length > 0) {
        const $ = cheerio.load(response.content);
        for (const errDef of login.error) {
          if ($(errDef.selector).length > 0) {
            this.cookies.clear();
            this.isAuthenticated = false;
            return false;
          }
        }
      }

      if (response.cookies.length > 0) {
        this.setCookies(response.cookies);
      }

      this.isAuthenticated = true;
      this.sessionSource = 'login';
      return true;
    } catch {
      this.cookies.clear();
      this.isAuthenticated = false;
      this.sessionSource = null;
      return false;
    }
  }

  /**
   * Ensures the current session is usable, going through the full login flow if needed.
   *
   * Unlike {@link ensureAuthenticated}, this also verifies an env-var-supplied cookie
   * against the live tracker (its `login.test` page) the first time it's used, since
   * such a cookie is otherwise trusted blindly and never re-checked. If verification
   * fails, the stale session is discarded and a real login is attempted as a fallback.
   */
  async ensureSessionValid(baseUrl: string): Promise<boolean> {
    const login = this.definition.login;
    if (!login) {
      return true;
    }

    if (!this.hasSession()) {
      return this.ensureAuthenticated(baseUrl);
    }

    if (this.sessionSource === 'cookie' && !this.envCookieVerified && login.test) {
      if (!this.pendingVerification) {
        this.pendingVerification = this.verifyEnvCookie(baseUrl).finally(() => {
          this.pendingVerification = null;
        });
      }
      return this.pendingVerification;
    }

    return true;
  }

  /**
   * Re-checks the session against `login.test` and logs in again if the tracker rejected it.
   *
   * Trackers answer an expired session with their login page, which parses as a search
   * with zero rows. Callers use this after an empty or error result to tell that apart
   * from a genuinely empty search. Concurrent callers share one check.
   */
  async recoverSession(baseUrl: string): Promise<SessionRecoveryOutcome> {
    if (!this.definition.login?.test) {
      return 'valid';
    }

    if (!this.pendingRecovery) {
      this.pendingRecovery = this.performRecovery(baseUrl).finally(() => {
        this.pendingRecovery = null;
      });
    }
    return this.pendingRecovery;
  }

  private async performRecovery(baseUrl: string): Promise<SessionRecoveryOutcome> {
    const previousSource = this.sessionSource;
    const probe = await this.probeSession(baseUrl);
    if (probe !== false) {
      return 'valid';
    }

    if (previousSource === 'cookie') {
      this.envCookieRejected = true;
    }
    this.invalidate();

    if (!(await this.ensureAuthenticated(baseUrl))) {
      return 'failed';
    }

    return (await this.probeSession(baseUrl)) === false ? 'failed' : 'renewed';
  }

  /**
   * Checks an env-var cookie against `login.test`. When the check cannot be made (the test
   * page failed to load), the cookie is kept unverified and checked again on its next use.
   */
  private async verifyEnvCookie(baseUrl: string): Promise<boolean> {
    const probe = await this.probeSession(baseUrl);
    if (probe === undefined) {
      return true;
    }
    if (probe) {
      this.envCookieVerified = true;
      return true;
    }

    // The tracker rejected the env cookie (expired, wrong account, IP-bound
    // session, etc). Discard it and fall back to a real login if credentials
    // are configured; mark it rejected so ensureAuthenticated doesn't just
    // re-adopt the same dead cookie instead of attempting a real login.
    this.envCookieRejected = true;
    this.invalidate();
    return this.ensureAuthenticated(baseUrl);
  }

  /**
   * Returns the formatted Cookie header string for HTTP requests.
   */
  getCookieHeader(): string {
    const pairs: string[] = [];
    for (const [key, value] of this.cookies.entries()) {
      pairs.push(`${key}=${value}`);
    }
    return pairs.join('; ');
  }

  /**
   * Derives the env-var identifier for this provider from its Cardigann id/site/name.
   */
  private getProviderId(): string {
    return (this.definition.id || this.definition.site || this.definition.name || '')
      .toUpperCase()
      .replaceAll(/[^A-Z0-9]/g, '_');
  }

  /**
   * Prefix of this tracker's environment variables, such as `TORRGATE_RUTRACKER_RU`.
   */
  get envVarPrefix(): string {
    return `TORRGATE_${this.getProviderId()}`;
  }

  /**
   * Returns whether a login is possible at all: a usable env cookie, a username and
   * password, or a login form that needs no configured credentials.
   */
  hasLoginCredentials(): boolean {
    const login = this.definition.login;
    if (!login) {
      return true;
    }
    if (!this.envCookieRejected && process.env[`${this.envVarPrefix}_COOKIE`]) {
      return true;
    }
    const username = process.env[`${this.envVarPrefix}_USERNAME`] || process.env.TRACKER_USERNAME;
    const password = process.env[`${this.envVarPrefix}_PASSWORD`] || process.env.TRACKER_PASSWORD;
    return Boolean(username && password) || !JSON.stringify(login.inputs || {}).includes('.Config.');
  }

  /**
   * Checks an already fetched page for the `login.test` selector (usually a logout link in
   * the site header). Returns `undefined` when the definition has no test selector.
   */
  pageShowsSession($: cheerio.CheerioAPI): boolean | undefined {
    const selector = this.definition.login?.test?.selector;
    return selector ? $(selector).length > 0 : undefined;
  }

  /**
   * Checks whether an authenticated session or cookies are currently available.
   */
  hasSession(): boolean {
    return this.isAuthenticated || this.cookies.size > 0;
  }

  /**
   * Invalidates the current session.
   */
  invalidate(): void {
    this.isAuthenticated = false;
    this.envCookieVerified = false;
    this.sessionSource = null;
    this.cookies.clear();
  }

  /**
   * Stores cookies from Set-Cookie headers or compound cookie strings.
   */
  setCookies(cookieHeaders: string[]): void {
    for (const header of cookieHeaders) {
      const parts = header.split(';');
      let currentCookieName: string | null = null;

      for (const part of parts) {
        const trimmed = part.trim();
        const equalIdx = trimmed.indexOf('=');
        if (equalIdx > 0) {
          const key = trimmed.slice(0, equalIdx).trim();
          const value = trimmed.slice(equalIdx + 1).trim();
          const lowerKey = key.toLowerCase();

          if (COOKIE_DIRECTIVES.has(lowerKey)) {
            if (lowerKey === 'max-age' && (value === '0' || value.startsWith('-'))) {
              if (currentCookieName) {
                this.cookies.delete(currentCookieName);
              }
            }
          } else {
            currentCookieName = key;
            if (value === '') {
              this.cookies.delete(key);
            } else {
              this.cookies.set(key, value);
            }
          }
        }
      }
    }
  }

  /**
   * Tests whether an existing session is still valid using login.test.
   */
  async testSession(baseUrl: string): Promise<boolean> {
    const testDef = this.definition.login?.test;
    if (!testDef || !testDef.path || !testDef.selector) {
      return this.isAuthenticated;
    }

    const probe = await this.probeSession(baseUrl);
    if (probe === false) {
      this.invalidate();
    }
    return probe === true;
  }

  /**
   * Fetches the login.test page with the current cookies. Returns `undefined` when the
   * check cannot be made (no test defined, or the request failed), so a network error
   * is never mistaken for a rejected session.
   */
  private async probeSession(baseUrl: string): Promise<boolean | undefined> {
    const testDef = this.definition.login?.test;
    if (!testDef?.path || !testDef.selector) {
      return undefined;
    }

    try {
      const testUrl = new URL(testDef.path, baseUrl).toString();
      const headers: Record<string, string> = {};
      const cookieHeader = this.getCookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      await this.requestThrottle?.acquire();
      const content = await this.httpClient.getDecoded(testUrl, this.encoding, { headers });
      const $ = cheerio.load(content);
      return $(testDef.selector).length > 0;
    } catch {
      return undefined;
    }
  }
}
