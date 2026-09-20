// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { getCategoryMappings } from '../../config/categories.js';
import { AGGREGATE_INDEXER_ID, ProviderRegistry } from '../../providers/registry.js';
import { collectResultWindow, WindowedResult } from '../../providers/result-window.js';
import { SearchOptions, TrackerProvider } from '../../types/provider.js';
import { buildCacheKey, CacheStore } from '../../utils/cache.js';
import { parseCategoryList } from '../../utils/category-mapping.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { getQueryInteger, getQueryString, safeParseInt } from '../../utils/query.js';
import {
  renderTorznabCaps,
  renderTorznabFeed,
  TORZNAB_ERROR_CODES,
  TorznabFeedEntry,
} from '../../utils/torznab-xml.js';
import { SearchCachePolicy, setSearchCacheHeaders } from '../cache-headers.js';
import { getProvidedApiKey, hashApiKey } from '../middleware/auth.js';
import { sendTorznabError } from '../torznab-errors.js';

const DEFAULT_FEED_LIMIT = 100;
const TORZNAB_REQUEST_TYPES = new Set(['caps', 'movie', 'search', 'tv-search', 'tvsearch']);

export class RssController {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly cache?: CacheStore<unknown>,
    private readonly cacheTtlSeconds = 300,
    private readonly configuredApiKey?: string
  ) {}

  /**
   * GET /api/v2.0/indexers/:indexer/results/torznab/api
   * Standard Torznab endpoint supporting t=caps and t=search/tvsearch/movie.
   */
  getRss = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
          : typeof req.params.provider === 'string'
            ? req.params.provider.toLowerCase()
            : '';

      if (!isValidIndexerId(indexerParam)) {
        sendTorznabError(res, 400, TORZNAB_ERROR_CODES.incorrectParameter, 'Invalid indexer identifier format');
        return;
      }

      const isAggregate = indexerParam === AGGREGATE_INDEXER_ID;
      const provider = isAggregate ? undefined : this.registry.getProvider(indexerParam);

      if (!isAggregate && !provider) {
        sendTorznabError(res, 404, TORZNAB_ERROR_CODES.incorrectParameter, `Indexer '${indexerParam}' not found`);
        return;
      }

      const t = String(req.query.t || 'search').toLowerCase();
      if (!TORZNAB_REQUEST_TYPES.has(t)) {
        sendTorznabError(
          res,
          400,
          TORZNAB_ERROR_CODES.incorrectParameter,
          `Unsupported Torznab request type '${t}'`
        );
        return;
      }

      if (t === 'caps') {
        const mappings = provider
          ? getCategoryMappings(provider)
          : this.registry.getAllProviders().flatMap(getCategoryMappings);
        const xml = renderTorznabCaps(mappings, { includeTrackerCategories: !isAggregate });
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.send(xml);
        return;
      }

      const q = buildTorznabQuery(req.query, t);
      const categories = parseCategoryList(req.query);
      const requestedLimit = getQueryInteger(req.query, ['limit', 'Limit'], 0, 0);
      const requestedOffset = getQueryInteger(req.query, ['offset'], 0);
      const requestedPage = getQueryInteger(req.query, ['Page', 'page'], 0, 0);
      if (requestedLimit === null || requestedOffset === null || requestedPage === null) {
        sendTorznabError(
          res,
          400,
          TORZNAB_ERROR_CODES.incorrectParameter,
          'limit, offset and page must be non-negative integers'
        );
        return;
      }
      const limit = requestedLimit || DEFAULT_FEED_LIMIT;
      const offset = requestedOffset ?? requestedPage * limit;

      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;
      const origin = `${req.protocol}://${req.get('host') || ''}`;

      const cacheKey = buildCacheKey('rss', [
        origin,
        indexerParam,
        t,
        q,
        [...categories].sort((a, b) => a - b),
        offset,
        limit,
        hashApiKey(effectiveApiKey),
      ]);

      if (this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as string | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.send(cached);
          return;
        }
      }

      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) {
          abortController.abort();
        }
      });

      const searchOptions: SearchOptions = {
        categories,
        query: q,
        signal: abortController.signal,
      };

      const providers = provider ? [provider] : this.registry.getAllProviders();
      const outcome = await collectResultWindow(providers, searchOptions, { limit, offset });
      const failedIds = Object.keys(outcome.errors);
      if (outcome.isTruncated) {
        sendTorznabError(
          res,
          502,
          TORZNAB_ERROR_CODES.unknownError,
          `Failed to search indexer '${indexerParam}': result window exceeded the page-round limit`
        );
        return;
      }
      if (failedIds.length > 0 && (provider || outcome.successfulCount === 0)) {
        const message = failedIds.map(id => (provider ? outcome.errors[id] : `${id}: ${outcome.errors[id]}`)).join('; ');
        sendTorznabError(
          res,
          502,
          TORZNAB_ERROR_CODES.unknownError,
          `Failed to search indexer '${indexerParam}': ${message}`
        );
        return;
      }
      const hasErrors = failedIds.length > 0;
      const entries = toFeedEntries(outcome.results);

      const xml = renderTorznabFeed(entries, {
        apiKey: effectiveApiKey,
        channelId: indexerParam,
        channelTitle: provider ? provider.name : 'TorrGate (all indexers)',
        origin,
      });

      if (this.cache && this.cacheTtlSeconds > 0 && !hasErrors) {
        await this.cache.set(cacheKey, xml, this.cacheTtlSeconds);
      }

      setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey, hasErrors));

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);
    } catch (err) {
      next(err);
    }
  };

  private cachePolicy(apiKey: string | undefined, hasErrors = false): SearchCachePolicy {
    return { isCacheable: !hasErrors, isPrivate: Boolean(apiKey), ttlSeconds: this.cacheTtlSeconds };
  }
}

/**
 * Builds the search keywords, appending `SxxEyy` / `Sxx` for Torznab TV searches.
 */
function buildTorznabQuery(query: Request['query'], searchType: string): string {
  const q = getQueryString(query, 'q', 'query') ?? '';
  if (searchType !== 'tvsearch' && searchType !== 'tv-search') {
    return q;
  }

  const season = safeParseInt(query.season);
  const episode = safeParseInt(query.ep);
  if (season === undefined) {
    return q;
  }

  const tag = episode === undefined
    ? `S${String(season).padStart(2, '0')}`
    : `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  if (q.toUpperCase().includes(tag)) {
    return q;
  }
  return q ? `${q} ${tag}` : tag;
}

function toFeedEntries(results: WindowedResult[]): TorznabFeedEntry[] {
  const mappingsByProvider = new Map<TrackerProvider, ReturnType<typeof getCategoryMappings>>();
  return results.map(({ item, provider }) => {
    let mappings = mappingsByProvider.get(provider);
    if (!mappings) {
      mappings = getCategoryMappings(provider);
      mappingsByProvider.set(provider, mappings);
    }
    return {
      item,
      mappings,
      trackerId: (provider.id || provider.name).toLowerCase(),
      trackerName: provider.name,
      trackerType: provider.type ?? 'public',
    };
  });
}
