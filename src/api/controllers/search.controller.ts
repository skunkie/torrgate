// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { buildCacheKey, CacheStore } from '../../cache/store.js';
import { bindManualSearchQuery } from '../../jackett/manual-search-query.js';
import { toJackettSearchResponse } from '../../jackett/manual-search-results.js';
import { JackettSearchResponse } from '../../jackett/types.js';
import { AGGREGATE_INDEXER_ID, ProviderRegistry } from '../../providers/registry.js';
import { searchManualIndexers } from '../../search/manual-search.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { SearchCachePolicy, setSearchCacheHeaders } from '../cache-headers.js';
import { getProvidedApiKey, hashApiKey } from '../middleware/auth.js';
import { CachedSearchResponse, collectTopicPath } from '../search-cache.js';

export class SearchController {
  /**
   * GET /api/v2.0/indexers/:indexer/results
   */
  searchByTitle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
          : '';

      if (indexerParam !== AGGREGATE_INDEXER_ID && !isValidIndexerId(indexerParam)) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid indexer identifier format',
          statusCode: 400,
          success: false,
        });
        return;
      }

      const selectedProvider = this.registry.getProvider(indexerParam);
      if (indexerParam !== AGGREGATE_INDEXER_ID && (!selectedProvider || selectedProvider.isConfigured === false)) {
        res.status(404).json({
          error: 'NotFound',
          message: selectedProvider ? 'Indexer is not configured' : `Indexer '${indexerParam}' not found`,
          statusCode: 404,
          success: false,
        });
        return;
      }

      const { options, searchIds, targetTrackers } = bindManualSearchQuery(req.originalUrl);
      const { categories, episode, imdbId, query, season } = options;

      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) {
          abortController.abort();
        }
      });

      options.signal = abortController.signal;

      const providers = (selectedProvider ? [selectedProvider] : this.registry.getAllProviders())
        .filter(provider => provider.isConfigured !== false)
        .filter(provider => targetTrackers === undefined || targetTrackers.includes(provider.id ?? provider.name.toLowerCase()));

      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;
      const origin = `${req.protocol}://${req.get('host') || ''}`;
      const cacheKey = buildCacheKey('search:v1', [
        origin,
        indexerParam,
        providers.map(provider => provider.id ?? provider.name),
        query,
        season,
        episode,
        imdbId,
        searchIds,
        categories,
        targetTrackers,
        hashApiKey(effectiveApiKey),
      ]);

      if (this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as CachedSearchResponse<JackettSearchResponse> | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          await this.registry.restoreTopicPaths(cached.topicPaths);
          res.json(cached.response);
          return;
        }
      }

      const settled = await searchManualIndexers(providers, options);
      const topicPaths: CachedSearchResponse<unknown>['topicPaths'] = {};
      for (const { items, provider } of settled) {
        for (const item of items) collectTopicPath(topicPaths, provider, item);
      }
      const response = toJackettSearchResponse(settled, origin, effectiveApiKey);
      const hasErrors = settled.some(outcome => outcome.error !== null);
      if (this.cache && this.cacheTtlSeconds > 0 && !hasErrors) {
        await this.cache.set(cacheKey, { response, topicPaths }, this.cacheTtlSeconds);
      }
      setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey, hasErrors));
      res.json(response);
    } catch (err) {
      next(err);
    }
  };

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly cache?: CacheStore<unknown>,
    private readonly cacheTtlSeconds = 300,
    private readonly configuredApiKey?: string
  ) {}

  private cachePolicy(apiKey: string | undefined, hasErrors = false): SearchCachePolicy {
    return { isCacheable: !hasErrors, isPrivate: Boolean(apiKey), ttlSeconds: this.cacheTtlSeconds };
  }
}
