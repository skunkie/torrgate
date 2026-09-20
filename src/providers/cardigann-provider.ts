// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';

import { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';

import { BinaryResponse, encodeWin1251QueryParam, HttpClient } from '../http/http-client.js';
import {
  ProviderCheckResult,
  ProviderName,
  SearchOptions,
  SearchPage,
  TorrentFile,
  TrackerProvider,
} from '../types/provider.js';
import { TopicDetails, TorrentItem } from '../types/torrent.js';
import { isTorrentFile } from '../utils/bencode.js';
import {
  expandTorznabCategories,
  matchesRequestedCategories,
  torznabCatToTrackerIds,
} from '../utils/category-mapping.js';
import { parseContentDispositionFileName, sanitizeTorrentFileName } from '../utils/content-disposition.js';
import { DEFAULT_TRACKER_TIME_ZONE, isValidTimeZone, normalizeDate } from '../utils/date.js';
import { RequestSlotStore, RequestThrottle } from '../utils/limiter.js';
import { buildMagnetUri, extractInfoHash } from '../utils/magnet.js';
import { findMatchingMirror } from '../utils/mirror.js';
import { parsePeerCount } from '../utils/peers.js';
import { parseSizeBytes } from '../utils/size.js';
import { applyFilters } from './filters.js';
import { getTorrentResultIdentity } from './result-identity.js';
import { SessionManager } from './session-manager.js';
import { renderTemplate } from './template.js';
import { CardigannDefinition, CardigannField, TemplateContext } from './types.js';

/**
 * Resolves a URL against a base URL, ensuring the scheme is safe (http, https, magnet).
 */
export function resolveSafeUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:' || resolved.protocol === 'magnet:') {
      return resolved.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Reads the tracker's time zone from `<prefix>_TIMEZONE` or `TRACKER_TIMEZONE`, falling back
 * to the default when unset or not a valid IANA name.
 */
function resolveTrackerTimeZone(envVarPrefix: string): string {
  const configured = process.env[`${envVarPrefix}_TIMEZONE`] || process.env.TRACKER_TIMEZONE;
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
  readonly encoding: 'utf-8' | 'windows-1251';
  readonly id: string;
  readonly name: ProviderName;
  /** Spaces requests to trackers whose definition sets `requestDelay`. */
  private readonly requestThrottle?: RequestThrottle;
  readonly sessionManager: SessionManager;
  /** Whether the search request templates reference `.Page`, so later pages return different rows. */
  readonly supportsPaging: boolean;
  /** IANA time zone in which the tracker displays times without an explicit zone. */
  readonly timeZone: string;
  readonly type: 'private' | 'public' | 'semi-private';
  readonly urls: string[];

  constructor(
    definition: CardigannDefinition,
    protected readonly httpClient: HttpClient
  ) {
    this.definition = definition;
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
    this.supportsPaging = /\.Page\b/.test(
      JSON.stringify([definition.search.paths, definition.search.inputs ?? {}])
    );
  }

  /**
   * Holds the definition's `requestDelay` across every process sharing `store`, not just this one.
   */
  shareRequestDelay(store: RequestSlotStore): void {
    this.requestThrottle?.shareSlot(store, `request-slot:${this.id}`);
  }

  /**
   * Checks availability of the tracker using an invented sample query.
   */
  async checkAvailability(): Promise<ProviderCheckResult> {
    const startTime = Date.now();
    try {
      await this.fetchWithFallback(baseUrl => baseUrl);
      return {
        isAvailable: true,
        name: this.name,
        responseTimeMs: Date.now() - startTime,
      };
    } catch {
      return {
        isAvailable: false,
        name: this.name,
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetches a .torrent file with the tracker session, logging in again once if the
   * tracker answers with a login or error page instead of the file.
   */
  async downloadTorrent(url: string): Promise<TorrentFile> {
    const baseUrl = findMatchingMirror(url, this.urls) ?? this.urls[0];
    const fetchFile = async (): Promise<BinaryResponse> => {
      const headers: Record<string, string> = {};
      if (this.definition.login) {
        await this.sessionManager.ensureSessionValid(baseUrl);
      }
      const cookieHeader = this.sessionManager.getCookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }
      await this.requestThrottle?.acquire();
      return this.httpClient.getBinary(url, { headers });
    };

    let response = await fetchFile();
    if (!isTorrentFile(response.data) && (await this.renewSessionIfRejected(baseUrl))) {
      response = await fetchFile();
    }
    if (!isTorrentFile(response.data)) {
      throw new Error('Upstream tracker returned non-torrent response (login or error page)');
    }

    return {
      data: response.data,
      fileName: sanitizeTorrentFileName(parseContentDispositionFileName(response.headers['content-disposition'])),
    };
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

  private sessionFailureError(): TrackerSessionError {
    if (!this.sessionManager.hasLoginCredentials()) {
      const prefix = this.sessionManager.envVarPrefix;
      return new TrackerSessionError(
        `Tracker ${this.name} requires an account: set ${prefix}_USERNAME and ${prefix}_PASSWORD, or ${prefix}_COOKIE`
      );
    }
    return new TrackerSessionError(
      `Tracker ${this.name} rejected the login session and logging in again failed`
    );
  }

  /**
   * Fetches content trying mirrors sequentially until one succeeds. With `formData` the
   * request is a form POST whose body is transcoded to the tracker's charset.
   */
  protected async fetchWithFallback(
    urlBuilder: (baseUrl: string) => string | Promise<string>,
    options?: AxiosRequestConfig,
    formData?: Record<string, string>
  ): Promise<{ baseUrl: string; content: string; workingUrl: string }> {
    let lastError: Error | null = null;

    for (const baseUrl of this.urls) {
      try {
        const url = await urlBuilder(baseUrl);
        await this.requestThrottle?.acquire(options?.signal instanceof AbortSignal ? options.signal : undefined);
        const content = formData
          ? (await this.httpClient.postForm(url, formData, this.encoding, options)).content
          : await this.httpClient.getDecoded(url, this.encoding, options);
        return { baseUrl, content, workingUrl: url };
      } catch (err) {
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
      let topicPath: string;
      if (this.definition.details?.path) {
        topicPath = renderTemplate(this.definition.details.path, { Id: id, id });
      } else {
        const detailsSelector = this.definition.search.fields.details?.selector || '';
        if (detailsSelector.includes('viewtopic.php')) {
          topicPath = `forum/viewtopic.php?t=${id}`;
        } else if (detailsSelector.includes('/torrent/')) {
          topicPath = `torrent/${id}`;
        } else {
          topicPath = `details.php?id=${id}`;
        }
      }

      const headers: Record<string, string> = {};
      const cookieHeader = this.sessionManager.getCookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      const fetchTopicPage = () => this.fetchWithFallback(
        async baseUrl => {
          if (this.definition.login) {
            await this.sessionManager.ensureSessionValid(baseUrl);
            const updatedCookie = this.sessionManager.getCookieHeader();
            if (updatedCookie) {
              headers.Cookie = updatedCookie;
            } else {
              delete headers.Cookie;
            }
          }
          const topicUrl = resolveSafeUrl(topicPath, baseUrl);
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
      const workingUrl = page.workingUrl;
      const name =
        $('h1').text().trim() ||
        $('a#topic-title').text().trim() ||
        $('a.maintitle').text().trim() ||
        $('.sub_title').text().trim() ||
        $('title').text().trim();

      if (!name) {
        return null;
      }

      const magnetHref = $('a[href^="magnet:"]').attr('href') || '';
      const infoHash = extractInfoHash(magnetHref) || '';
      let magnetUri = magnetHref;
      if (!magnetUri && infoHash) {
        magnetUri = buildMagnetUri(infoHash, this.definition.trackers);
      } else if (
        magnetUri &&
        this.definition.trackers &&
        this.definition.trackers.length > 0 &&
        !magnetUri.includes('&tr=')
      ) {
        for (const tracker of this.definition.trackers) {
          magnetUri += `&tr=${encodeURIComponent(tracker)}`;
        }
      }

      let imdbUrl = '';
      $('a[href*="imdb.com"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('imdb.com')) {
          imdbUrl = href;
          return false;
        }
      });

      let kinopoiskUrl = '';
      $('a[href*="kinopoisk.ru"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('kinopoisk.ru')) {
          kinopoiskUrl = href;
          return false;
        }
      });

      const posterUrl =
        $('table#details img, .postImg, .p200 img, .postbody img, img.poster').attr('src') ||
        $('var.postImg').attr('title') ||
        $('img').first().attr('src') ||
        '';

      const description =
        $('#details, .post_body, .postbody, .content').text().trim() || '';

      const downloadHref =
        $('a[href^="download.php"], a[href*="dl.php"], a[href^="https://d."]').attr('href') || '';
      const torrentUrl = downloadHref
        ? (resolveSafeUrl(downloadHref, workingUrl) ?? workingUrl)
        : workingUrl;

      return {
        actors: [],
        audioTranslation: '',
        category: '',
        description,
        director: '',
        duration: '',
        id,
        imdbId: imdbUrl.replace(/[^0-9]/g, '') || undefined,
        imdbUrl,
        infoHash,
        kinopoiskId: kinopoiskUrl.replace(/[^0-9]/g, '') || undefined,
        kinopoiskUrl,
        magnetUri,
        name,
        posterUrl,
        releaseCountry: '',
        torrentUrl,
        url: workingUrl,
        year: '',
      };
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
    return (await this.searchPageByTitle(options)).items;
  }

  /**
   * Searches one tracker page and reports whether the tracker can have a following page.
   */
  async searchPageByTitle(options: SearchOptions): Promise<SearchPage> {
    const pathDef = this.definition.search.paths[0];
    if (!pathDef) {
      return { hasMore: false, items: [] };
    }

    if ((options.page ?? 0) > 0 && !this.supportsPaging) {
      return { hasMore: false, items: [] };
    }

    const config: Record<string, boolean | number | string> = {};
    if (this.definition.settings) {
      for (const setting of this.definition.settings) {
        if (setting.name && setting.default !== undefined) {
          config[setting.name] = setting.default;
        }
      }
    }

    let processedKeywords = options.query || '';
    if (this.definition.search.keywordsfilters) {
      processedKeywords = applyFilters(
        processedKeywords,
        this.definition.search.keywordsfilters,
        { Config: config, Keywords: processedKeywords }
      );
    }

    const mappings = this.definition.caps?.categorymappings || [];
    const requestedCategories = options.categories ?? [];
    const trackerCategoryIds =
      requestedCategories.length > 0 ? torznabCatToTrackerIds(requestedCategories, mappings) : [];
    if (requestedCategories.length > 0 && trackerCategoryIds.length === 0) {
      return { hasMore: false, items: [] };
    }
    // Definitions take a single category id, so a request spanning several tracker
    // categories searches unfiltered and the results are filtered afterwards.
    const singleCategory = trackerCategoryIds.length === 1 ? trackerCategoryIds[0] : 0;

    const context: TemplateContext = {
      Categories: trackerCategoryIds,
      Category: singleCategory,
      Config: config,
      Keywords: processedKeywords,
      Page: options.page ?? 0,
      Query: {
        Category: singleCategory,
        Format: options.format,
        Page: options.page ?? 0,
        Query: processedKeywords,
        Year: options.year ?? 0,
      },
      Today: {
        Year: new Date().getFullYear(),
      },
    };

    const encodedKeywords =
      this.encoding === 'windows-1251'
        ? encodeWin1251QueryParam(processedKeywords, false)
        : encodeURIComponent(processedKeywords);
    const pathContext: TemplateContext = {
      ...context,
      Keywords: encodedKeywords,
      Query: { ...context.Query, Query: encodedKeywords },
    };

    const renderedPath = renderTemplate(pathDef.path, pathContext);
    const queryParams: Record<string, string> = {};

    const allInputs = {
      ...(this.definition.search.inputs || {}),
      ...(pathDef.inputs || {}),
    };

    for (const [key, tmpl] of Object.entries(allInputs)) {
      queryParams[key] = renderTemplate(String(tmpl), context);
    }

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
      ? Object.fromEntries(Object.entries(queryParams).filter(([, v]) => v !== ''))
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
          await this.sessionManager.ensureSessionValid(baseUrl);
          const updatedCookie = this.sessionManager.getCookieHeader();
          if (updatedCookie) {
            requestHeaders.Cookie = updatedCookie;
          } else {
            delete requestHeaders.Cookie;
          }
        }

        const url = new URL(renderedPath, baseUrl);
        if (isPost) {
          return url.toString();
        }
        if (this.encoding === 'windows-1251') {
          const pairs = url.search
            .slice(1)
            .split('&')
            .filter(pair => {
              const key = decodeURIComponent(pair.split('=')[0].replaceAll('+', ' '));
              return pair !== '' && (!(key in queryParams) || queryParams[key] === '');
            });
          for (const [k, v] of Object.entries(queryParams)) {
            if (v !== '') {
              pairs.push(`${encodeWin1251QueryParam(k)}=${encodeWin1251QueryParam(v)}`);
            }
          }
          const queryString = pairs.join('&');
          return `${url.origin}${url.pathname}${queryString ? `?${queryString}` : ''}`;
        }

        for (const [k, v] of Object.entries(queryParams)) {
          if (v !== '') {
            url.searchParams.set(k, v);
          }
        }
        return url.toString();
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

    const workingUrl = page.workingUrl;
    const results: TorrentItem[] = [];
    const filterOptions = { timeZone: this.timeZone };
    const rowsSelector = this.definition.search.rows.selector;
    const after = this.definition.search.rows.after ?? 0;
    const rawRows = $(rowsSelector).slice(after);
    const rawRowCount = rawRows.length;

    rawRows
      .each((_, rowElement) => {
        const row = $(rowElement);
        const rowContext: TemplateContext = {
          ...context,
          Result: {},
        };

        const extractField = (fieldDef?: CardigannField): string => {
          if (!fieldDef) return '';
          if (fieldDef.text !== undefined) {
            const rawText = String(fieldDef.text);
            const rendered = rawText.includes('{{')
              ? renderTemplate(rawText, rowContext)
              : rawText;
            return applyFilters(rendered, fieldDef.filters, rowContext, filterOptions);
          }

          let raw = '';
          const target = fieldDef.selector ? row.find(fieldDef.selector) : row;

          if (fieldDef.attribute) {
            raw = target.attr(fieldDef.attribute) || '';
          } else {
            raw = target.text().trim();
          }

          return applyFilters(raw, fieldDef.filters, rowContext, filterOptions);
        };

        const fields = this.definition.search.fields;
        for (const [key, fieldDef] of Object.entries(fields)) {
          const val = extractField(fieldDef);
          if (rowContext.Result) {
            rowContext.Result[key] = val;
          }
        }

        const title = rowContext.Result?.title ?? extractField(fields.title);
        if (!title) return;

        const detailsRaw = rowContext.Result?.details ?? extractField(fields.details);
        const detailsUrl = resolveSafeUrl(detailsRaw, workingUrl) ?? '';

        const torrentRaw = rowContext.Result?.download ?? extractField(fields.download);
        const torrentUrl = resolveSafeUrl(torrentRaw, workingUrl) ?? '';
        let magnetUri = rowContext.Result?.magnet ?? extractField(fields.magnet);
        const rawInfoHash = rowContext.Result?.infohash ?? extractField(fields.infohash);
        const infoHash = extractInfoHash(magnetUri) || extractInfoHash(rawInfoHash);
        if (!magnetUri && infoHash) {
          magnetUri = buildMagnetUri(infoHash, this.definition.trackers);
        } else if (
          magnetUri &&
          this.definition.trackers &&
          this.definition.trackers.length > 0 &&
          !magnetUri.includes('&tr=')
        ) {
          for (const tracker of this.definition.trackers) {
            magnetUri += `&tr=${encodeURIComponent(tracker)}`;
          }
        }
        const rawSize = rowContext.Result?.size ?? extractField(fields.size);
        const rawSeeders = rowContext.Result?.seeders ?? extractField(fields.seeders);
        const rawLeechers = rowContext.Result?.leechers ?? extractField(fields.leechers);
        const rawDate = rowContext.Result?.date ?? extractField(fields.date);
        const rawCategory = rowContext.Result?.category ?? extractField(fields.category);
        const rawGrabs = rowContext.Result?.grabs ?? extractField(fields.grabs);

        let topicId =
          rowContext.Result?.id ||
          extractField(fields.id) ||
          rawInfoHash;
        if (!topicId && detailsUrl) {
          const idMatch = detailsUrl.match(/[?&]t=(\d+)|[?&]id=(\d+)|\/torrent\/(\d+)/);
          topicId = idMatch ? idMatch[1] || idMatch[2] || idMatch[3] : '';
        }

        results.push({
          category: rawCategory,
          date: normalizeDate(rawDate, this.timeZone),
          downloadCount: parsePeerCount(rawGrabs),
          id: topicId || String(results.length + 1),
          leechers: parsePeerCount(rawLeechers),
          magnetUri: magnetUri || undefined,
          name: title,
          seeders: parsePeerCount(rawSeeders),
          size: rawSize,
          sizeBytes: parseSizeBytes(rawSize),
          torrentUrl: torrentUrl || detailsUrl,
          url: detailsUrl,
        });
      });

    const pageIdentity = results.length > 0
      ? crypto
        .createHash('sha256')
        .update(JSON.stringify(results.map(getTorrentResultIdentity)))
        .digest('hex')
      : undefined;
    const expandedCategories = expandTorznabCategories(requestedCategories);
    const categoryItems = requestedCategories.length === 0
      ? results
      : results.filter(item =>
        matchesRequestedCategories(item.category, expandedCategories, mappings)
      );
    const requestedFormat = options.format;
    const items = requestedFormat === undefined
      ? categoryItems
      : categoryItems.filter(item => matchesVideoFormat(item.name, requestedFormat));
    return {
      hasMore: this.supportsPaging && rawRowCount > 0,
      items,
      pageIdentity,
    };
  }
}

function matchesVideoFormat(title: string, format: number): boolean {
  const numericFormat = new RegExp(`(^|\\D)${format}(?:i|p)?(?=\\D|$)`, 'i');
  return numericFormat.test(title) || (format === 2160 && /(^|\W)4k(?=\W|$)/i.test(title));
}
