// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';
import path from 'node:path';

import * as cheerio from 'cheerio';

import { MemoryCache } from '../../cache/memory-cache.js';
import { BatchCacheStore, buildCacheKey, CacheStore, CacheWrite } from '../../cache/store.js';
import { createTopicPathCache, getLocalTopicPathStore, getTopicPathStore } from '../../cache/topic-path-cache.js';
import { HttpClient, HttpRequestOptions } from '../../http/http-client.js';
import { RequestSlotStore, RequestThrottle } from '../../http/request-throttle.js';
import { canHandleCategories } from '../../jackett/categories/mapping.js';
import { parseSearchModes, TorznabSearchCaps } from '../../jackett/torznab/caps.js';
import { JackettIndexerCaps } from '../../jackett/types.js';
import { ProviderCheckResult, ProviderName, SearchOptions, TorrentDownload, TrackerCategoryMapping, TrackerProvider } from '../../types/provider.js';
import { TopicDetails, TorrentItem } from '../../types/torrent.js';
import { DEFAULT_TRACKER_TIME_ZONE, isValidTimeZone } from '../../utils/date.js';
import { resolveSafeUrl } from '../../utils/url.js';
import { getDefinitionCategoryMappings } from './categories.js';
import { downloadTorrent } from './download.js';
import { createSearchContext } from './search-context.js';
import { buildSearchInputs, buildSearchUrl, renderSearchPath } from './search-request.js';
import { parseSearchResults } from './search-results.js';
import { SessionManager } from './session-manager.js';
import { renderTemplate } from './template.js';
import { parseTopicDetails } from './topic-details.js';
import { CardigannDefinition, CardigannPath } from './types.js';

/**
 * Reads the tracker's time zone from `<prefix>_TIMEZONE` or `TORRGATE_TRACKER_TIMEZONE`, falling back
 * to the default when unset or not a valid IANA name.
 */
function resolveTrackerTimeZone(envVarPrefix: string): string {
  const configured = process.env[`${envVarPrefix}_TIMEZONE`] || process.env.TORRGATE_TRACKER_TIMEZONE;
  if (!configured) {
    return DEFAULT_TRACKER_TIME_ZONE;
  }
  if (!isValidTimeZone(configured)) {
    console.warn(`[TorrGate] Ignoring unknown time zone '${configured}' for ${envVarPrefix}; using ${DEFAULT_TRACKER_TIME_ZONE}`);
    return DEFAULT_TRACKER_TIME_ZONE;
  }
  return configured;
}

/**
 * Raised when a tracker requires a session that cannot be established.
 */
export class TrackerSessionError extends Error {
  override name = 'TrackerSessionError';
}

/**
 * Executes a Cardigann YAML definition as a TorrGate tracker provider.
 */
export class CardigannProvider implements TrackerProvider {
  readonly definition: CardigannDefinition;
  readonly description?: string;
  readonly encoding: 'utf-8' | 'windows-1251';
  readonly id: string;
  readonly language?: string;
  private localTopicPaths?: MemoryCache<string>;
  readonly name: ProviderName;
  /** Spaces requests to trackers whose definition sets `requestDelay`. */
  private readonly requestThrottle?: RequestThrottle;
  readonly searchCaps: TorznabSearchCaps;
  private readonly searchTopicPaths = new WeakMap<TorrentItem, CacheWrite<string>>();
  readonly sessionManager: SessionManager;
  private sharedTopicPaths?: BatchCacheStore;
  /** IANA time zone in which the tracker displays times without an explicit zone. */
  readonly timeZone: string;
  private topicPathScope = '';
  private topicPathTtlSeconds = 300;
  readonly type: 'private' | 'public' | 'semi-private';
  readonly urls: string[];

  constructor(
    definition: CardigannDefinition,
    protected readonly httpClient: HttpClient
  ) {
    this.definition = definition;
    this.description = definition.description;
    this.language = definition.language;
    this.id = (definition.id || definition.site || definition.name).toLowerCase();
    this.name = (definition.name || definition.id || definition.site) as ProviderName;
    this.type = definition.type ?? 'public';
    this.urls =
      definition.links && definition.links.length > 0
        ? definition.links
        : ['https://example.org'];
    this.encoding =
      definition.encoding?.toLowerCase() === 'windows-1251' ? 'windows-1251' : 'utf-8';
    const requestDelaySeconds = Number(definition.requestDelay);
    if (Number.isFinite(requestDelaySeconds) && requestDelaySeconds > 0) {
      this.requestThrottle = new RequestThrottle(requestDelaySeconds * 1000);
    }
    this.sessionManager = new SessionManager(definition, httpClient, this.requestThrottle);
    this.timeZone = resolveTrackerTimeZone(this.sessionManager.envVarPrefix);
    this.searchCaps = {
      modes: parseSearchModes(definition.caps?.modes),
      supportsRawSearch: definition.caps?.allowrawsearch === true,
      supportsTvImdbSearch: definition.caps?.allowtvsearchimdb === true,
    };
  }

  get categoryMappings(): TrackerCategoryMapping[] {
    return getDefinitionCategoryMappings(this.definition.caps);
  }

  get caps(): JackettIndexerCaps | undefined {
    if (!this.definition.caps) return undefined;
    return {
      CategoryMapping: this.categoryMappings.map(mapping => ({ Cat: mapping.cat, Desc: mapping.desc ?? '', ID: mapping.id })),
      Modes: this.definition.caps.modes,
    };
  }

  get isConfigured(): boolean {
    return this.sessionManager.hasLoginCredentials();
  }

  /**
   * Holds the definition's `requestDelay` across every process sharing `store`, not just this one.
   */
  shareRequestDelay(store: RequestSlotStore): void {
    this.requestThrottle?.shareSlot(store, `request-slot:${this.id}`);
  }

  /**
   * Shares mirror-relative topic paths across instances with deployment and definition isolation.
   */
  shareTopicPaths(store: CacheStore, namespace: string, cacheTtlSeconds: number): void {
    this.sharedTopicPaths = getTopicPathStore(store);
    this.localTopicPaths = store instanceof MemoryCache ? undefined : getLocalTopicPathStore(store);
    this.topicPathScope = createHash('sha256')
      .update(JSON.stringify([namespace, this.definition]))
      .digest('hex');
    // Search responses are cached after topic paths, so allow time for the search to finish.
    this.topicPathTtlSeconds = cacheTtlSeconds + 300;
  }

  private topicPathKey(id: string): string {
    return buildCacheKey('topic-path', [this.topicPathScope, this.id, id]);
  }

  /**
   * Returns the topic-path entry recorded for this result by the search that produced it.
   */
  getTopicPathCacheEntry(item: TorrentItem): CacheWrite<string> | undefined {
    return this.searchTopicPaths.get(item);
  }

  /**
   * Restores local paths for standalone or Redis-backed providers. In-memory shared paths
   * are written by the caller's batch so each path is stored once.
   */
  restoreTopicPaths(entries: readonly CacheWrite<string>[]): void {
    if ((!this.localTopicPaths && this.sharedTopicPaths) || entries.length === 0) return;
    this.localTopicPaths ??= createTopicPathCache();
    this.localTopicPaths.setMany(entries, this.topicPathTtlSeconds);
  }

  /**
   * Checks whether a configured tracker mirror responds.
   */
  async checkAvailability(): Promise<ProviderCheckResult> {
    try {
      await this.fetchWithFallback(baseUrl => baseUrl);
      return {
        isAvailable: true,
        name: this.name,
      };
    } catch {
      return {
        isAvailable: false,
        name: this.name,
      };
    }
  }

  async downloadTorrent(url: string): Promise<TorrentDownload> {
    return downloadTorrent(url, {
      definition: this.definition,
      ensureSession: baseUrl => this.ensureSession(baseUrl),
      httpClient: this.httpClient,
      renewSession: baseUrl => this.renewSessionIfRejected(baseUrl),
      requestThrottle: this.requestThrottle,
      sessionManager: this.sessionManager,
      urls: this.urls,
    });
  }

  /**
   * After a tracker response that may mean the session expired, checks the session and logs
   * in again if the tracker rejected it. A fetched page that still shows the session (the
   * `login.test` selector) skips the check. Returns `true` when a new session was
   * established and the request should be repeated.
   */
  private async renewSessionIfRejected(baseUrl: string, $?: cheerio.CheerioAPI): Promise<boolean> {
    if (!this.definition.login) {
      return false;
    }
    if ($ && this.sessionManager.pageShowsSession($) === true) {
      return false;
    }

    const recovery = await this.sessionManager.recoverSession(baseUrl);
    if (recovery === 'failed') {
      throw this.sessionFailureError();
    }
    return recovery === 'renewed';
  }

  /**
   * Establishes the tracker session before a request. While a failed login holds off the
   * next attempt and no session remains, fails without sending the tracker a request it
   * would only answer with a login page.
   */
  private async ensureSession(baseUrl: string): Promise<void> {
    await this.sessionManager.ensureSessionValid(baseUrl);
    if (!this.sessionManager.hasSession() && this.sessionManager.isLoginDeferred()) {
      throw this.sessionFailureError();
    }
  }

  private sessionFailureError(): TrackerSessionError {
    if (!this.sessionManager.hasLoginCredentials()) {
      const prefix = this.sessionManager.envVarPrefix;
      if (this.definition.login?.method === 'cookie') {
        return new TrackerSessionError(`Tracker ${this.name} requires a browser session cookie: set ${prefix}_COOKIE`);
      }
      return new TrackerSessionError(
        `Tracker ${this.name} requires an account: set ${prefix}_USERNAME and ${prefix}_PASSWORD, or ${prefix}_COOKIE`
      );
    }
    const reason = this.sessionManager.loginError ? `: ${this.sessionManager.loginError}` : '';
    const retryAt = this.sessionManager.loginRetryAt;
    const retry = retryAt ? `; the next login attempt is held until ${retryAt.toISOString()}` : '';
    return new TrackerSessionError(
      `Tracker ${this.name} rejected the login session and logging in again failed${reason}${retry}`
    );
  }

  /**
   * Fetches content trying mirrors sequentially until one succeeds. With `formData` the
   * request is a form POST whose body is transcoded to the tracker's charset.
   */
  protected async fetchWithFallback(
    urlBuilder: (baseUrl: string) => string | Promise<string>,
    options?: HttpRequestOptions,
    formData?: Record<string, string> | URLSearchParams
  ): Promise<{ baseUrl: string; content: string; workingUrl: string }> {
    let lastError: Error | null = null;

    for (const baseUrl of this.urls) {
      try {
        const url = await urlBuilder(baseUrl);
        const requestOptions = { ...options, requestThrottle: this.requestThrottle };
        const content = formData
          ? (await this.httpClient.postForm(url, formData, this.encoding, requestOptions)).content
          : await this.httpClient.getDecoded(url, this.encoding, requestOptions);
        return { baseUrl, content, workingUrl: url };
      } catch (err) {
        if (err instanceof TrackerSessionError) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(
      `All mirrors for provider ${this.name} failed. Last error: ${lastError?.message || 'unknown'}`
    );
  }

  /**
   * Retrieves detailed topic information for a tracker topic ID.
   */
  async getTopicDetails(id: string): Promise<TopicDetails | null> {
    try {
      let searchPath: string | undefined;
      let topicPath: string;
      const rememberedTopicPath = this.definition.details?.path
        ? undefined
        : this.localTopicPaths?.get<string>(this.topicPathKey(id))
          ?? await this.sharedTopicPaths?.get<string>(this.topicPathKey(id));
      if (this.definition.details?.path) {
        topicPath = renderTemplate(this.definition.details.path, { Id: id, id });
      } else if (rememberedTopicPath) {
        topicPath = rememberedTopicPath;
      } else {
        const detailsSelector = this.definition.search.fields.details?.selector || '';
        if (detailsSelector.includes('viewtopic.php')) {
          const hrefPrefix = detailsSelector.match(/\[href\^=["']([^"']*viewtopic\.php\?t=)["']\]/)?.[1];
          topicPath = hrefPrefix ? `${hrefPrefix}${id}` : `forum/viewtopic.php?t=${id}`;
          if (hrefPrefix) {
            searchPath = this.definition.search.paths[0]?.path;
          }
        } else if (detailsSelector.includes('/torrent/')) {
          topicPath = `torrent/${id}`;
        } else {
          topicPath = `details.php?id=${id}`;
        }
      }

      const searchContext = searchPath !== undefined ? createSearchContext(this.definition, this.sessionManager.settings, { query: '' }) : undefined;
      const headers: Record<string, string> = {};
      const cookieHeader = this.sessionManager.getCookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      const fetchTopicPage = () => this.fetchWithFallback(
        async baseUrl => {
          if (this.definition.login) {
            await this.ensureSession(baseUrl);
            const updatedCookie = this.sessionManager.getCookieHeader();
            if (updatedCookie) {
              headers.Cookie = updatedCookie;
            } else {
              delete headers.Cookie;
            }
          }
          const renderedSearchPath = searchPath !== undefined && searchContext
            ? renderSearchPath(searchPath, searchContext, baseUrl, this.encoding)
            : undefined;
          const searchUrl = resolveSafeUrl(renderedSearchPath, baseUrl) ?? baseUrl;
          const topicUrl = resolveSafeUrl(topicPath, searchUrl);
          if (!topicUrl) {
            throw new Error(`Unsafe or invalid topic URL for ${this.name}: ${topicPath}`);
          }
          return topicUrl;
        },
        { headers }
      );

      let page = await fetchTopicPage();
      let $ = cheerio.load(page.content);
      if (
        this.sessionManager.pageShowsSession($) === false &&
        (await this.renewSessionIfRejected(page.baseUrl, $))
      ) {
        page = await fetchTopicPage();
        $ = cheerio.load(page.content);
      }
      if (this.sessionManager.pageShowsSession($)) {
        this.sessionManager.confirmSession();
      }
      return parseTopicDetails($, id, page.workingUrl, this.definition.trackers);
    } catch (err) {
      if (err instanceof TrackerSessionError) {
        throw err;
      }
      console.warn(`[TorrGate] Failed to scrape topic details for ${id}:`, err);
      return null;
    }
  }

  /**
   * Counts the result rows the definition's row selector matches on a search page.
   */
  private countRows($: cheerio.CheerioAPI): number {
    return $(this.definition.search.rows.selector).slice(this.definition.search.rows.after ?? 0).length;
  }

  /**
   * Returns the text of the first matching `search.error` element, or `undefined` when none matches.
   */
  private findSearchError($: cheerio.CheerioAPI): string | undefined {
    for (const errDef of this.definition.search.error ?? []) {
      const match = $(errDef.selector);
      if (match.length > 0) {
        return match.first().text().trim();
      }
    }
    return undefined;
  }

  /**
   * Searches topics by title using the Cardigann definition.
   */
  async searchByTitle(options: SearchOptions): Promise<TorrentItem[]> {
    if (!canHandleCategories(options.categories ?? [], getDefinitionCategoryMappings(this.definition.caps))) return [];
    const items: TorrentItem[] = [];
    for (const pathDef of this.definition.search.paths) {
      items.push(...await this.searchPathByTitle(options, pathDef));
    }
    return items;
  }

  private async searchPathByTitle(options: SearchOptions, pathDef: CardigannPath): Promise<TorrentItem[]> {
    const context = createSearchContext(this.definition, this.sessionManager.settings, options);
    if (pathDef.categories?.length) {
      const pathCategories = new Set(pathDef.categories);
      const matches = (context.Categories ?? []).filter(category => pathCategories.has(String(category)));
      const isNegated = pathDef.categories[0] === '!';
      if (isNegated ? matches.length > 0 : matches.length === 0) {
        return [];
      }
      context.Categories = matches;
      context.Category = context.Categories.length === 1 ? context.Categories[0] : 0;
      if (context.Query) context.Query.Category = context.Category;
    }
    const queryParams = buildSearchInputs(this.definition.search, pathDef, context);

    const rawHeaders = {
      ...(this.definition.search.headers || {}),
      ...(pathDef.headers || {}),
    };

    const requestHeaders: Record<string, string> = {};
    const cookieHeader = this.sessionManager.getCookieHeader();
    if (cookieHeader) {
      requestHeaders.Cookie = cookieHeader;
    }

    const isPost = pathDef.method === 'post';
    const formData = isPost
      ? queryParams
      : undefined;

    const fetchSearchPage = () => this.fetchWithFallback(
      async baseUrl => {
        const siteLink = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        if (context.Config) {
          context.Config.sitelink = siteLink;
        }

        for (const [k, v] of Object.entries(rawHeaders)) {
          if (Array.isArray(v)) {
            requestHeaders[k] = v.map(item => renderTemplate(String(item), context)).join(', ');
          } else if (typeof v === 'string') {
            requestHeaders[k] = renderTemplate(v, context);
          } else if (v !== undefined) {
            requestHeaders[k] = String(v);
          }
        }

        if (this.definition.login) {
          await this.ensureSession(baseUrl);
          const updatedCookie = this.sessionManager.getCookieHeader();
          if (updatedCookie) {
            requestHeaders.Cookie = updatedCookie;
          } else {
            delete requestHeaders.Cookie;
          }
        }

        return buildSearchUrl(pathDef.path, context, baseUrl, this.encoding, queryParams, isPost);
      },
      { headers: requestHeaders, signal: options.signal },
      formData
    );

    let page = await fetchSearchPage();
    let $ = cheerio.load(page.content);

    const looksEmpty = this.findSearchError($) !== undefined || this.countRows($) === 0;
    if (looksEmpty && (await this.renewSessionIfRejected(page.baseUrl, $))) {
      page = await fetchSearchPage();
      $ = cheerio.load(page.content);
    }

    const searchError = this.findSearchError($);
    if (searchError !== undefined) {
      throw new Error(`Tracker ${this.name} returned an error page${searchError ? `: ${searchError}` : ''}`);
    }
    if (this.sessionManager.pageShowsSession($) || this.countRows($) > 0) {
      this.sessionManager.confirmSession();
    }

    const items = parseSearchResults($, {
      context,
      definition: this.definition,
      options,
      searchCaps: this.searchCaps,
      timeZone: this.timeZone,
      workingUrl: page.workingUrl,
    });
    const entries: CacheWrite<string>[] = [];
    if (!this.definition.details?.path) {
      const mirrorUrl = new URL(page.baseUrl);
      const mirrorDirectory = new URL('.', mirrorUrl).pathname;
      for (const item of items) {
        const topicUrl = resolveSafeUrl(item.url, page.workingUrl);
        if (!topicUrl) continue;
        const target = new URL(topicUrl);
        if (target.origin !== mirrorUrl.origin) continue;
        const relativePath = path.posix.relative(mirrorDirectory, target.pathname);
        const entry = {
          key: this.topicPathKey(item.id),
          value: `./${relativePath}${target.search}${target.hash}`,
        };
        this.searchTopicPaths.set(item, entry);
        entries.push(entry);
      }
    }
    this.restoreTopicPaths(entries);
    await this.sharedTopicPaths?.setMany(entries, this.topicPathTtlSeconds);
    return items;
  }
}
