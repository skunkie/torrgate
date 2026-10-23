// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { buildCacheKey, CacheStore } from '../../cache/store.js';
import { ProviderRegistry } from '../../providers/registry.js';
import { TopicDetails } from '../../types/torrent.js';
import { getErrorMessage } from '../../utils/error-message.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { SearchCachePolicy, setSearchCacheHeaders } from '../cache-headers.js';
import { getProvidedApiKey, hashApiKey } from '../middleware/auth.js';

const TOPIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class DetailsController {
  /**
   * GET /api/v2.0/indexers/:indexer/details/:id
   */
  searchById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
          : '';

      if (!isValidIndexerId(indexerParam)) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid indexer identifier format',
          statusCode: 400,
          success: false,
        });
        return;
      }

      const topicId = typeof req.params.id === 'string' ? req.params.id : '';

      if (!TOPIC_ID_PATTERN.test(topicId)) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Topic ID may only contain letters, digits, underscores and hyphens',
          statusCode: 400,
          success: false,
        });
        return;
      }

      const provider = this.registry.getProvider(indexerParam);
      if (!provider) {
        res.status(404).json({
          error: 'NotFound',
          message: `Indexer '${indexerParam}' not found`,
          statusCode: 404,
          success: false,
        });
        return;
      }

      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;
      const origin = `${req.protocol}://${req.get('host') || ''}`;
      const cacheKey = buildCacheKey('details', [
        origin,
        indexerParam,
        topicId,
        hashApiKey(this.configuredApiKey),
      ]);

      if (this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as TopicDetails[] | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          res.json(cached);
          return;
        }
      }

      let details: TopicDetails | null = null;
      try {
        details = await provider.getTopicDetails(topicId);
      } catch (err) {
        const message = getErrorMessage(err, 'Upstream indexer details lookup failed');
        res.status(502).json({
          error: 'BadGateway',
          message: `Failed to fetch topic details from '${provider.name}': ${message}`,
          statusCode: 502,
          success: false,
        });
        return;
      }

      if (!details) {
        res.status(404).json({
          error: 'NotFound',
          message: `Topic ID '${topicId}' not found on indexer '${provider.name}'`,
          statusCode: 404,
          success: false,
        });
        return;
      }

      const response = [details];
      if (this.cache && this.cacheTtlSeconds > 0) {
        await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
      }

      setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey));

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

  private cachePolicy(apiKey: string | undefined): SearchCachePolicy {
    return { isCacheable: true, isPrivate: Boolean(apiKey), ttlSeconds: this.cacheTtlSeconds };
  }
}
