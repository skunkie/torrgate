// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { getCategoryMappings } from '../../config/categories.js';
import { AGGREGATE_INDEXER_ID, ProviderRegistry } from '../../providers/registry.js';
import { collectResultWindow } from '../../providers/result-window.js';
import { CardigannCategoryMapping } from '../../providers/types.js';
import { JackettIndexerStatus, JackettResultItem, JackettSearchResponse } from '../../types/jackett.js';
import { SearchOptions } from '../../types/provider.js';
import { TopicDetails, TorrentItem } from '../../types/torrent.js';
import { buildCacheKey, CacheStore } from '../../utils/cache.js';
import { parseCategoryList, trackerCatToTorznab } from '../../utils/category-mapping.js';
import { parseToIsoString } from '../../utils/date.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { extractInfoHash } from '../../utils/magnet.js';
import { getQueryInteger, getQueryString } from '../../utils/query.js';
import { SearchCachePolicy, setSearchCacheHeaders } from '../cache-headers.js';
import { getProvidedApiKey, hashApiKey } from '../middleware/auth.js';

/**
 * Topic ids are inserted into tracker URL paths, so only plain identifiers are accepted.
 */
const TOPIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const VIDEO_FORMATS = new Set([720, 1080, 2160]);

/**
 * Parses tracker filter list from Tracker[] or tracker[] query parameters.
 */
function parseTrackerParam(query: Request['query']): string[] | undefined {
  const raw =
    query['Tracker[]'] ??
    query['tracker[]'] ??
    query.Tracker ??
    query.tracker;

  if (Array.isArray(raw)) {
    return raw.map(String).map(s => s.trim()).filter(Boolean);
  }

  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  return undefined;
}

/**
 * Transforms a TorrentItem into JackettResultItem.
 */
function toJackettResultItem(
  item: TorrentItem,
  trackerName: string,
  trackerId: string,
  mappings: CardigannCategoryMapping[] = [],
  origin: string = '',
  trackerType: 'private' | 'public' | 'semi-private' = 'public',
  apiKey?: string
): JackettResultItem {
  const publishDate = parseToIsoString(item.date);
  const infoHash = extractInfoHash(item.magnetUri);
  const { catDesc, catIds } = trackerCatToTorznab(item.category, mappings);

  const apiKeyParam = apiKey ? `&jackett_apikey=${encodeURIComponent(apiKey)}` : '';
  const downloadPath = item.torrentUrl
    ? `/api/v2.0/indexers/${trackerId}/download?url=${encodeURIComponent(item.torrentUrl)}${apiKeyParam}`
    : item.url;
  const downloadLink = origin && downloadPath.startsWith('/')
    ? `${origin}${downloadPath}`
    : downloadPath;

  const sizeBytes = item.sizeBytes ?? 0;
  const gigabytes = sizeBytes / (1024 * 1024 * 1024);
  const gain = Math.round(item.seeders * gigabytes * 100) / 100;

  return {
    BlackholeLink: null,
    Category: catIds,
    CategoryDesc: catDesc,
    Description: null,
    Details: item.url || item.torrentUrl,
    DownloadVolumeFactor: trackerType === 'private' ? 1.0 : 0.0,
    Files: null,
    FirstSeen: publishDate,
    Gain: gain,
    Grabs: item.downloadCount || null,
    Guid: item.url || item.torrentUrl || item.id,
    InfoHash: infoHash,
    Link: downloadLink,
    MagnetUri: item.magnetUri || null,
    MinimumRatio: 1.0,
    MinimumSeedTime: 172800,
    Peers: item.seeders + item.leechers,
    PublishDate: publishDate,
    RssId: null,
    Seeders: item.seeders,
    Size: sizeBytes,
    Title: item.name,
    Tracker: trackerName,
    TrackerId: trackerId,
    TrackerType: trackerType,
    UploadVolumeFactor: 1.0,
  };
}

export class SearchController {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly cache?: CacheStore<unknown>,
    private readonly cacheTtlSeconds = 300,
    private readonly configuredApiKey?: string
  ) {}

  private cachePolicy(apiKey: string | undefined, hasErrors = false): SearchCachePolicy {
    return { isCacheable: !hasErrors, isPrivate: Boolean(apiKey), ttlSeconds: this.cacheTtlSeconds };
  }

  /**
   * GET /api/v2.0/indexers/:indexer/results
   */
  searchByTitle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const startTime = Date.now();
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
          : typeof req.params.provider === 'string'
            ? req.params.provider.toLowerCase()
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

      const query = getQueryString(req.query, 'Query', 'query', 'q') ?? '';

      const categories = parseCategoryList(req.query);
      const requestedLimit = getQueryInteger(req.query, ['limit', 'Limit'], 0);
      const requestedOffset = getQueryInteger(req.query, ['offset'], 0);
      const requestedPage = getQueryInteger(req.query, ['Page', 'page'], 0, 0);
      const year = getQueryInteger(req.query, ['Year', 'year'], 0);
      const format = getQueryInteger(req.query, ['format'], 0);
      if (
        requestedLimit === null ||
        requestedOffset === null ||
        requestedPage === null ||
        year === null ||
        format === null
      ) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'limit, offset, page, year and format must be non-negative integers',
          statusCode: 400,
          success: false,
        });
        return;
      }
      if (format !== undefined && !VIDEO_FORMATS.has(format)) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'format must be one of 720, 1080 or 2160',
          statusCode: 400,
          success: false,
        });
        return;
      }

      const isWindowRequested = requestedLimit !== undefined || requestedOffset !== undefined;
      const limit = requestedLimit || 100;
      const offset = isWindowRequested ? (requestedOffset ?? requestedPage * limit) : 0;
      if (
        !Number.isSafeInteger(offset) ||
        (isWindowRequested && !Number.isSafeInteger(offset + limit))
      ) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'The requested result window is too large',
          statusCode: 400,
          success: false,
        });
        return;
      }
      const page = isWindowRequested ? 0 : requestedPage;
      const targetTrackers = parseTrackerParam(req.query);

      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) {
          abortController.abort();
        }
      });

      const options: SearchOptions = {
        categories,
        format,
        page,
        query,
        signal: abortController.signal,
        year,
      };

      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;
      const origin = `${req.protocol}://${req.get('host') || ''}`;

      const cacheKey = buildCacheKey('search', [
        origin,
        indexerParam,
        query,
        [...categories].sort((a, b) => a - b),
        isWindowRequested ? 'window' : 'page',
        page,
        isWindowRequested ? offset : undefined,
        isWindowRequested ? limit : undefined,
        year,
        format,
        targetTrackers ? [...targetTrackers].sort() : undefined,
        hashApiKey(effectiveApiKey),
      ]);

      if (this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as JackettSearchResponse | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          res.json(cached);
          return;
        }
      }

      if (indexerParam === AGGREGATE_INDEXER_ID) {
        const allResults: JackettResultItem[] = [];
        const indexerStatuses: JackettIndexerStatus[] = [];
        const elapsedTime = Date.now() - startTime;
        let errors: Record<string, string>;

        if (isWindowRequested) {
          const providers = this.registry.getSearchProviders(targetTrackers);
          const outcome = await collectResultWindow(providers, options, { limit, offset });
          if (outcome.isTruncated) {
            res.status(502).json({
              error: 'BadGateway',
              message: `Failed to search indexer '${indexerParam}': result window exceeded the page-round limit`,
              statusCode: 502,
              success: false,
            });
            return;
          }

          errors = outcome.errors;
          const resultCounts = new Map(providers.map(provider => [provider, 0]));
          for (const { item, provider } of outcome.results) {
            const providerId = (provider.id || provider.name).toLowerCase();
            resultCounts.set(provider, (resultCounts.get(provider) ?? 0) + 1);
            allResults.push(
              toJackettResultItem(
                item,
                provider.name,
                providerId,
                getCategoryMappings(provider),
                origin,
                provider.type ?? 'public',
                effectiveApiKey
              )
            );
          }
          for (const provider of providers) {
            const providerId = (provider.id || provider.name).toLowerCase();
            const error = errors[providerId];
            indexerStatuses.push({
              ElapsedTime: elapsedTime,
              Error: error || null,
              ID: providerId,
              Name: provider.name,
              Results: resultCounts.get(provider) ?? 0,
              Status: error ? 1 : 2,
            });
          }
        } else {
          const aggregatedResults = await this.registry.searchAll(options, targetTrackers);
          errors = aggregatedResults.errors;
          for (const [providerId, items] of Object.entries(aggregatedResults.results)) {
            const provider = this.registry.getProvider(providerId);
            const providerName = provider?.name ?? providerId;
            const error = errors[providerId];
            indexerStatuses.push({
              ElapsedTime: elapsedTime,
              Error: error || null,
              ID: providerId,
              Name: providerName,
              Results: items.length,
              Status: error ? 1 : 2,
            });

            const mappings = provider ? getCategoryMappings(provider) : [];
            for (const item of items) {
              allResults.push(
                toJackettResultItem(
                  item,
                  providerName,
                  providerId,
                  mappings,
                  origin,
                  provider?.type ?? 'public',
                  effectiveApiKey
                )
              );
            }
          }
        }

        const response: JackettSearchResponse = {
          Indexers: indexerStatuses,
          Results: allResults,
        };
        const hasErrors = Object.keys(errors).length > 0;

        if (this.cache && this.cacheTtlSeconds > 0 && !hasErrors) {
          await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
        }

        setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey, hasErrors));

        res.json(response);
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

      const mappings = getCategoryMappings(provider);

      let items: TorrentItem[];
      try {
        if (isWindowRequested) {
          const outcome = await collectResultWindow([provider], options, { limit, offset });
          if (outcome.isTruncated) {
            throw new Error('result window exceeded the page-round limit');
          }
          const error = Object.values(outcome.errors)[0];
          if (error) {
            throw new Error(error);
          }
          items = outcome.results.map(result => result.item);
        } else {
          items = await provider.searchByTitle(options);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upstream indexer search failed';
        res.status(502).json({
          error: 'BadGateway',
          message: `Failed to search indexer '${indexerParam}': ${message}`,
          statusCode: 502,
          success: false,
        });
        return;
      }

      const results = items.map(item =>
        toJackettResultItem(
          item,
          provider.name,
          indexerParam,
          mappings,
          origin,
          provider.type ?? 'public',
          effectiveApiKey
        )
      );

      const response: JackettSearchResponse = {
        Indexers: [
          {
            ElapsedTime: Date.now() - startTime,
            Error: null,
            ID: indexerParam,
            Name: provider.name,
            Results: results.length,
            Status: 2,
          },
        ],
        Results: results,
      };

      if (this.cache && this.cacheTtlSeconds > 0) {
        await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
      }

      setSearchCacheHeaders(res, 'MISS', this.cachePolicy(effectiveApiKey));

      res.json(response);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v2.0/indexers/:indexer/details/:id or search by topic ID
   */
  searchById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const indexerParam =
        typeof req.params.indexer === 'string'
          ? req.params.indexer.toLowerCase()
          : typeof req.params.provider === 'string'
            ? req.params.provider.toLowerCase()
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

      const topicId = (typeof req.params.id === 'string' ? req.params.id : '') || getQueryString(req.query, 'query', 'Query', 'id') || '';

      if (!topicId) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Topic ID parameter or query is required',
          statusCode: 400,
          success: false,
        });
        return;
      }

      if (!TOPIC_ID_PATTERN.test(topicId)) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'Topic ID may only contain letters, digits, underscores and hyphens',
          statusCode: 400,
          success: false,
        });
        return;
      }

      const cacheKey = `details:${indexerParam}:${topicId}`;
      const effectiveApiKey = getProvidedApiKey(req) || this.configuredApiKey;

      if (this.cache && this.cacheTtlSeconds > 0) {
        const cached = (await this.cache.get(cacheKey)) as TorrentItem[] | undefined;
        if (cached) {
          setSearchCacheHeaders(res, 'HIT', this.cachePolicy(effectiveApiKey));
          res.json(cached);
          return;
        }
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

      let details: TopicDetails | null = null;
      try {
        details = await provider.getTopicDetails(topicId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upstream indexer details lookup failed';
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
}
