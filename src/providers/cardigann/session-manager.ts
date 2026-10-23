// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import * as cheerio from 'cheerio';

import { DecodedResponse, encodeWin1251QueryParam, HttpClient } from '../../http/http-client.js';
import { RequestThrottle } from '../../http/request-throttle.js';
import { formatCookieHeader, storeCookies } from './cookies.js';
import { buildLoginForm, LoginFormError } from './login-form.js';
import { resolveSettings, SettingValue } from './settings.js';
import { hasTemplateValues, renderTemplate } from './template.js';
import { CardigannDefinition, CardigannLogin, CardigannLoginMethod, TemplateContext } from './types.js';

/**
 * Wait before retrying after the first failed login. It doubles with each further failure up
 * to {@link MAX_LOGIN_RETRY_DELAY_MS}, so wrong credentials or a CAPTCHA do not send the
 * tracker a login attempt with every search, which trackers answer with CAPTCHAs or bans.
 */
export const INITIAL_LOGIN_RETRY_DELAY_MS = 60_000;

/**
 * Longest wait between login attempts after repeated failures.
 */
export const MAX_LOGIN_RETRY_DELAY_MS = 30 * 60_000;

const LOGIN_METHODS = new Set<string>(['cookie', 'form', 'get', 'post'] satisfies CardigannLoginMethod[]);

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
  private consecutiveLoginFailures = 0;
  private readonly cookies: Map<string, string> = new Map();
  private readonly definition: CardigannDefinition;
  private readonly encoding: 'utf-8' | 'windows-1251';
  private readonly httpClient: HttpClient;
  private isAuthenticated: boolean = false;
  /** Set once an env-var cookie has been checked against the tracker and rejected, so it isn't retried. */
  private isEnvCookieRejected: boolean = false;
  private isEnvCookieVerified: boolean = false;
  private loginErrorMessage: string | undefined;
  /** Time before which no new login is attempted, after a failed one. */
  private loginRetryAtMs = 0;
  private pendingLogin: Promise<boolean> | null = null;
  private pendingRecovery: Promise<SessionRecoveryOutcome> | null = null;
  private pendingVerification: Promise<boolean> | null = null;
  /** Source of the current authenticated state, used to decide whether live verification is needed. */
  private sessionSource: 'cookie' | 'login' | null = null;
  /** `.Config` values of the definition's settings, from environment variables or defaults. */
  readonly settings: Record<string, SettingValue>;

  constructor(
    definition: CardigannDefinition,
    httpClient: HttpClient,
    private readonly requestThrottle?: RequestThrottle
  ) {
    this.definition = definition;
    this.httpClient = httpClient;
    this.encoding =
      definition.encoding?.toLowerCase() === 'windows-1251' ? 'windows-1251' : 'utf-8';
    this.settings = resolveSettings(definition.settings, this.envVarPrefix);

    const envCookie = process.env[`${this.envVarPrefix}_COOKIE`];
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
   * Ensures that the session is authenticated if the definition requires login. After a
   * failed login, returns `false` without contacting the tracker until the retry delay passes.
   */
  async ensureAuthenticated(baseUrl: string): Promise<boolean> {
    const login = this.definition.login;
    if (!login || this.isAuthenticated) {
      return true;
    }

    if (this.pendingLogin) {
      return this.pendingLogin;
    }

    if (this.isLoginDeferred()) {
      return false;
    }

    this.pendingLogin = this.performLogin(baseUrl).finally(() => {
      this.pendingLogin = null;
    });

    return this.pendingLogin;
  }

  private async performLogin(baseUrl: string): Promise<boolean> {
    this.loginErrorMessage = undefined;
    const login = this.definition.login;
    if (!login) {
      return false;
    }

    const envCookie = this.isEnvCookieRejected
      ? undefined
      : process.env[`${this.envVarPrefix}_COOKIE`];
    if (envCookie) {
      this.setCookies([envCookie]);
      if (this.cookies.size > 0) {
        this.isAuthenticated = true;
        this.sessionSource = 'cookie';
        return true;
      }
    }

    const method = login.method ?? 'post';
    if (!LOGIN_METHODS.has(method)) {
      this.loginErrorMessage = `unsupported login method '${method}'`;
      return false;
    }
    if (method === 'cookie') {
      this.loginErrorMessage = `the tracker needs a browser session cookie in ${this.envVarPrefix}_COOKIE`;
      return false;
    }

    if (!login.path) {
      return false;
    }

    const config = this.getLoginConfig(baseUrl);
    if (!this.hasLoginSettings(config)) {
      return false;
    }
    const context: TemplateContext = { Config: config };

    try {
      const loginUrl = new URL(renderTemplate(login.path, context), baseUrl).toString();
      const formData: Record<string, string> = {};

      if (login.inputs) {
        for (const [key, tmpl] of Object.entries(login.inputs)) {
          formData[key] = renderTemplate(String(tmpl), context);
        }
      }

      const response = await this.submitLogin(login, method, loginUrl, formData, context);

      if (login.error && login.error.length > 0) {
        const $ = cheerio.load(response.content);
        for (const errDef of login.error) {
          if ($(errDef.selector).length > 0) {
            this.loginErrorMessage = errDef.message?.text
              ?? (errDef.message?.selector ? $(errDef.message.selector).first().text().trim() : undefined);
            this.recordLoginFailure();
            return false;
          }
        }
      }

      if (response.cookies.length > 0) {
        this.setCookies(response.cookies);
      }

      this.isAuthenticated = true;
      this.sessionSource = 'login';
      if (!login.test) {
        this.consecutiveLoginFailures = 0;
      }
      return true;
    } catch (err) {
      this.loginErrorMessage ??= err instanceof LoginFormError ? err.message : undefined;
      this.recordLoginFailure();
      return false;
    }
  }

  /**
   * Sends the login request for `post`, `get` and `form` definitions.
   *
   * `get` sends the inputs as a query string. `form` loads the login page, takes the
   * `login.form` form's own fields, overrides them with the definition's inputs, and submits
   * it to its action (or `login.submitpath`) with the cookies the page set.
   */
  private async submitLogin(
    login: CardigannLogin,
    method: Exclude<CardigannLoginMethod, 'cookie'>,
    loginUrl: string,
    formData: Record<string, string>,
    context: TemplateContext
  ): Promise<DecodedResponse> {
    const requestOptions = { requestThrottle: this.requestThrottle };
    if (method === 'post') {
      return this.httpClient.postForm(loginUrl, formData, this.encoding, requestOptions);
    }

    if (method === 'get') {
      const url = new URL(loginUrl);
      const query = Object.entries(formData).map(([key, value]) =>
        this.encoding === 'windows-1251'
          ? `${encodeWin1251QueryParam(key)}=${encodeWin1251QueryParam(value)}`
          : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      );
      const search = [url.search.slice(1), ...query].filter(Boolean).join('&');
      return this.httpClient.getKeepingCookies(
        `${url.origin}${url.pathname}${search ? `?${search}` : ''}`,
        this.encoding,
        requestOptions
      );
    }

    const page = await this.httpClient.getKeepingCookies(loginUrl, this.encoding, requestOptions);
    this.setCookies(page.cookies);
    const { fields, submitUrl } = buildLoginForm(page.content, login, loginUrl, formData, context);
    const cookieHeader = this.getCookieHeader();
    return this.httpClient.postForm(submitUrl, fields, this.encoding, {
      ...requestOptions,
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    });
  }

  /**
   * Discards the session after a failed login and schedules the earliest next attempt.
   */
  private recordLoginFailure(): void {
    this.cookies.clear();
    this.isAuthenticated = false;
    this.sessionSource = null;
    this.consecutiveLoginFailures += 1;
    const delayMs = Math.min(
      INITIAL_LOGIN_RETRY_DELAY_MS * 2 ** (this.consecutiveLoginFailures - 1),
      MAX_LOGIN_RETRY_DELAY_MS
    );
    this.loginRetryAtMs = Date.now() + delayMs;
  }

  /**
   * Records that the tracker served a page or file only a working session gets, so the next
   * failed login starts again from the shortest retry delay.
   */
  confirmSession(): void {
    if (this.sessionSource === 'login') {
      this.consecutiveLoginFailures = 0;
    }
  }

  /**
   * Whether a recent failed login still holds off the next attempt.
   */
  isLoginDeferred(): boolean {
    return Date.now() < this.loginRetryAtMs;
  }

  /**
   * When the next login may be attempted after a failed one, or `undefined` when nothing holds it off.
   */
  get loginRetryAt(): Date | undefined {
    return this.isLoginDeferred() ? new Date(this.loginRetryAtMs) : undefined;
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

    if (this.sessionSource === 'cookie' && !this.isEnvCookieVerified && login.test) {
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
    if (!this.hasSession() && this.isLoginDeferred()) {
      return 'failed';
    }

    const previousSource = this.sessionSource;
    const probe = await this.probeSession(baseUrl);
    if (probe !== false) {
      return 'valid';
    }

    if (previousSource === 'cookie') {
      this.isEnvCookieRejected = true;
    }
    this.invalidate();

    if (!(await this.ensureAuthenticated(baseUrl))) {
      return 'failed';
    }

    if ((await this.probeSession(baseUrl)) === false) {
      if (this.sessionSource === 'login') {
        this.loginErrorMessage ??= 'the tracker did not accept the new session';
        this.recordLoginFailure();
      }
      this.invalidate();
      return 'failed';
    }
    this.confirmSession();
    return 'renewed';
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
      this.isEnvCookieVerified = true;
      return true;
    }

    // The tracker rejected the env cookie (expired, wrong account, IP-bound
    // session, etc). Discard it and fall back to a real login if credentials
    // are configured; mark it rejected so ensureAuthenticated doesn't just
    // re-adopt the same dead cookie instead of attempting a real login.
    this.isEnvCookieRejected = true;
    this.invalidate();
    return this.ensureAuthenticated(baseUrl);
  }

  /**
   * Returns the formatted Cookie header string for HTTP requests.
   */
  getCookieHeader(): string {
    return formatCookieHeader(this.cookies);
  }

  get loginError(): string | undefined {
    return this.loginErrorMessage;
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
   * Returns whether the tracker needs no login, has a current session, or has the settings
   * referenced by its login templates.
   */
  hasLoginCredentials(): boolean {
    const login = this.definition.login;
    if (!login) {
      return true;
    }
    if (this.hasSession()) {
      return true;
    }
    if (login.method === 'cookie') {
      return false;
    }
    return this.hasLoginSettings(this.getLoginConfig(this.definition.links?.[0] ?? ''));
  }

  private getLoginConfig(baseUrl: string): NonNullable<TemplateContext['Config']> {
    return {
      ...this.settings,
      password: process.env[`${this.envVarPrefix}_PASSWORD`] || process.env.TORRGATE_TRACKER_PASSWORD || '',
      sitelink: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
      username: process.env[`${this.envVarPrefix}_USERNAME`] || process.env.TORRGATE_TRACKER_USERNAME || '',
    };
  }

  private hasLoginSettings(config: NonNullable<TemplateContext['Config']>): boolean {
    const login = this.definition.login;
    const templates = [login?.path, login?.submitpath, ...Object.values(login?.inputs ?? {})];
    try {
      return templates.every(template => hasTemplateValues(String(template ?? ''), { Config: config }));
    } catch {
      return false;
    }
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
    this.isEnvCookieVerified = false;
    this.sessionSource = null;
    this.cookies.clear();
  }

  /**
   * Stores cookies from Set-Cookie headers or compound cookie strings.
   */
  setCookies(cookieHeaders: string[]): void {
    storeCookies(this.cookies, cookieHeaders);
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

      const content = await this.httpClient.getDecoded(testUrl, this.encoding, {
        headers,
        requestThrottle: this.requestThrottle,
      });
      const $ = cheerio.load(content);
      return $(testDef.selector).length > 0;
    } catch {
      return undefined;
    }
  }
}
