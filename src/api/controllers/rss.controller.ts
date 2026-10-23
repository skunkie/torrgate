// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { buildCacheKey, CacheStore } from '../../cache/store.js';
import { canHandleCategories } from '../../jackett/categories/mapping.js';
import { getTorznabQueryString } from '../../jackett/query.js';
import {
  BASIC_SEARCH_CAPS,
  canHandleSearch,
  mergeSearchCaps,
  TORZNAB_AGGREGATE_CAPS_LIMIT,
  TORZNAB_CAPS_LIMIT
} from '../../jackett/torznab/caps.js';
import { renderTorznabCaps } from '../../jackett/torznab/caps-xml.js';
import { renderTorznabIndexers } from '../../jackett/torznab/indexers.js';
import { bindTorznabQuery, bindTorznabSearch, TorznabQueryError } from '../../jackett/torznab/query.js';
import { renderTorznabFeed, TORZNAB_ERROR_CODES, TorznabFeedEntry } from '../../jackett/torznab/xml.js';
import { AGGREGATE_INDEXER_ID, ProviderRegistry } from '../../providers/registry.js';
import { AGGREGATE_SEARCH_TIMEOUT_MS, IndexerResult, searchIndexers } from '../../search/indexer-search.js';
import { SearchOptions, TrackerProvider } from '../../types/provider.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { SearchCachePolicy, setSearchCacheHeaders } from '../cache-headers.js';
import { getProvidedApiKey, hashApiKey } from '../middleware/auth.js';
import { CachedSearchResponse, collectTopicPath } from '../search-cache.js';
import { sendTorznabError } from '../torznab-errors.js';

/**
 * Channel name, description, and site link of Jackett's aggregate indexer feed.
 */
const AGGREGATE_CHANNEL_TITLE = 'AggregateSearch';
const AGGREGATE_CHANNEL_DESCRIPTION = 'This feed includes all configured trackers';
const AGGREGATE_CHANNEL_LINK = 'http://127.0.0.1/';

export class RssController {
  /**
   * GET /api/v2.0/indexers/:indexer/results/torznab/api
   * Torznab capabilities, indexer discovery, and search feeds.
   */
  getRss = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
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

      if (provider?.isConfigured === false) {
        sendTorznabError(res, 404, TORZNAB_ERROR_CODES.incorrectParameter, 'Indexer is not configured');
        return;
      }

      const parsed = bindTorznabQuery(req.originalUrl);
      const { extended, limit, offset, query, searchIds, season, shouldUseCache, t, year } = parsed;

      const allProviders = provider ? [provider] : this.registry.getAllProviders().filter(candidate => candidate.isConfigured !== false);
      const searchCaps = provider
        ? provider.searchCaps ?? BASIC_SEARCH_CAPS
        : mergeSearchCaps(allProviders.map(candidate => candidate.searchCaps ?? BASIC_SEARCH_CAPS));

      if (t === 'indexers') {
        if (!isAggregate) {
          sendTorznabError(res, 400, TORZNAB_ERROR_CODES.functionNotAvailable, "Function Not Available: this isn't a meta indexer");
          return;
        }
        const configured = getTorznabQueryString(query, 'configured')?.toLowerCase();
        const indexers = this.registry.getAllProviders()
          .filter(candidate => configured !== 'true' && configured !== 'false' || (candidate.isConfigured ?? true) === (configured === 'true'))
          .map(candidate => ({
            description: candidate.description,
            id: candidate.id ?? candidate.name.toLowerCase(),
            isConfigured: candidate.isConfigured ?? true,
            language: candidate.language,
            link: getSiteLink(candidate),
            mappings: candidate.categoryMappings ?? [],
            searchCaps: candidate.searchCaps,
            title: candidate.name,
            type: candidate.type ?? 'public',
          }));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.send(renderTorznabIndexers(indexers));
        return;
      }

      if (t === 'caps') {
        const xml = renderTorznabCaps(allProviders.flatMap(candidate => candidate.categoryMappings ?? []), {
          resultLimit: isAggregate ? TORZNAB_AGGREGATE_CAPS_LIMIT : TORZNAB_CAPS_LIMIT,
          searchCaps,
          shouldIncludeTrackerCategories: !isAggregate,
        });
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.send(xml);
        return;
      }

      const { categories, episode, imdbId, searchRequest, searchTerm, searchTexts, searchType } = bindTorznabSearch(parsed, searchCaps, indexerParam);
      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;
      const origin = `${req.protocol}://${req.get('host') || ''}`;
      const feedOptions = {
        apiKey: effectiveApiKey,
        channelDescription: provider ? provider.description : AGGREGATE_CHANNEL_DESCRIPTION,
        channelLink: provider ? getSiteLink(provider) : AGGREGATE_CHANNEL_LINK,
        channelTitle: provider ? provider.name : AGGREGATE_CHANNEL_TITLE,
        origin,
      };

      if (offset > 0 || !canHandleCategories(categories, allProviders.flatMap(candidate => candidate.categoryMappings ?? []), !isAggregate)) {
        setSearchCacheHeaders(res, undefined, this.cachePolicy(effectiveApiKey, shouldUseCache));
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.send(renderTorznabFeed([], feedOptions));
        return;
      }

      const cacheKey = buildCacheKey('rss:v1', [
        origin,
        indexerParam,
        allProviders.map(candidate => candidate.id ?? candidate.name),
        t,
        searchTerm,
        season,
        episode,
        extended,
        imdbId,
        categories,
        limit,
        hashApiKey(effectiveApiKey),
        year,
        searchIds,
        searchTexts,
      ]);

      if (shouldUseCache && this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as CachedSearchResponse<string> | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          await this.registry.restoreTopicPaths(cached.topicPaths);
          res.send(cached.response);
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
        ...searchIds,
        ...searchTexts,
        categories,
        episode,
        extended,
        imdbId,
        limit,
        offset,
        query: searchTerm,
        searchType,
        season,
        shouldDropIncompleteReleases: true,
        signal: abortController.signal,
        year,
      };

      const providers = allProviders.filter(candidate =>
        canHandleSearch(candidate.searchCaps ?? BASIC_SEARCH_CAPS, searchRequest)
      );
      const outcome = await searchIndexers(providers, searchOptions, {
        isOrderedByGain: isAggregate,
        limit,
        timeoutMs: isAggregate ? AGGREGATE_SEARCH_TIMEOUT_MS : undefined,
      });
      const failedIds = Object.keys(outcome.errors);
      if (failedIds.length > 0 && provider) {
        const message = Object.values(outcome.errors).join('; ');
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

      const xml = renderTorznabFeed(entries, feedOptions);

      if (this.cache && this.cacheTtlSeconds > 0 && !hasErrors) {
        const topicPaths: CachedSearchResponse<unknown>['topicPaths'] = {};
        for (const { item, provider } of outcome.results) collectTopicPath(topicPaths, provider, item);
        await this.cache.set(cacheKey, { response: xml, topicPaths }, this.cacheTtlSeconds);
      }

      setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey, !hasErrors && shouldUseCache));

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.send(xml);
    } catch (err) {
      if (err instanceof TorznabQueryError) {
        sendTorznabError(res, 400, err.code, err.message);
        return;
      }
      next(err);
    }
  };

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly cache?: CacheStore<unknown>,
    private readonly cacheTtlSeconds = 300,
    private readonly configuredApiKey?: string
  ) {}

  private cachePolicy(apiKey: string | undefined, isCacheable = true): SearchCachePolicy {
    return { isCacheable, isPrivate: Boolean(apiKey), ttlSeconds: this.cacheTtlSeconds };
  }
}

/**
 * Returns an indexer's first site link with a trailing slash, as Jackett's site links have.
 */
function getSiteLink(provider: TrackerProvider): string {
  const link = provider.urls[0] ?? '';
  return link.endsWith('/') ? link : `${link}/`;
}

function toFeedEntries(results: IndexerResult[]): TorznabFeedEntry[] {
  const mappingsByProvider = new Map<TrackerProvider, NonNullable<TrackerProvider['categoryMappings']>>();
  return results.map(({ item, provider }) => {
    let mappings = mappingsByProvider.get(provider);
    if (!mappings) {
      mappings = provider.categoryMappings ?? [];
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
