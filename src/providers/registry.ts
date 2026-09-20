// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import path from 'path';

import { HttpClient } from '../http/http-client.js';
import { AggregatedSearchOutcome } from '../types/api.js';
import {
  ProviderCheckResult,
  ProviderInfo,
  SearchOptions,
  TrackerProvider,
} from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { RequestSlotStore } from '../utils/limiter.js';
import { CardigannProvider } from './cardigann-provider.js';
import { loadDefinitionsFromDir } from './loader.js';

/**
 * Indexer id that the API routes treat as "every indexer".
 */
export const AGGREGATE_INDEXER_ID = 'all';

/**
 * Registry holding and managing tracker scraper providers loaded from Cardigann definitions.
 */
export class ProviderRegistry {
  readonly httpClient: HttpClient;
  private readonly lookup: Map<string, TrackerProvider> = new Map();
  private readonly uniqueProviders: Map<string, TrackerProvider> = new Map();

  constructor(
    httpClient: HttpClient,
    definitionsDir: string = path.resolve(process.cwd(), 'definitions')
  ) {
    this.httpClient = httpClient;
    const providers = loadDefinitionsFromDir(definitionsDir, httpClient);
    for (const provider of providers) {
      const key = (provider.id || provider.name).toLowerCase();
      if (key === AGGREGATE_INDEXER_ID || provider.name.toLowerCase() === AGGREGATE_INDEXER_ID) {
        console.warn(`[TorrGate] Skipping definition '${provider.name}': '${AGGREGATE_INDEXER_ID}' is reserved for searching every indexer`);
        continue;
      }
      if (this.uniqueProviders.has(key)) {
        console.warn(`[TorrGate] Skipping definition '${provider.name}': another definition already uses the id '${key}'`);
        continue;
      }
      this.registerProvider(provider);
    }
  }

  /**
   * Registers an additional or replacement tracker provider.
   * Throws when the id or name is the reserved aggregate id `all`.
   */
  registerProvider(provider: TrackerProvider): void {
    if (
      (provider.id || '').toLowerCase() === AGGREGATE_INDEXER_ID ||
      provider.name.toLowerCase() === AGGREGATE_INDEXER_ID
    ) {
      throw new Error(`'${AGGREGATE_INDEXER_ID}' is reserved for searching every indexer`);
    }
    const primaryKey = (provider.id || provider.name).toLowerCase();
    this.uniqueProviders.set(primaryKey, provider);

    const nameKey = provider.name.toLowerCase();
    this.lookup.set(nameKey, provider);

    if (provider.id) {
      this.lookup.set(provider.id.toLowerCase(), provider);
    }
  }

  /**
   * Checks availability of all registered providers concurrently.
   */
  async checkAllAvailability(): Promise<ProviderCheckResult[]> {
    const checks = this.getAllProviders().map(p => p.checkAvailability());
    return Promise.all(checks);
  }

  /**
   * Retrieves all registered providers.
   */
  getAllProviders(): TrackerProvider[] {
    return Array.from(this.uniqueProviders.values());
  }

  /**
   * Retrieves provider metadata for all registered providers.
   */
  getProviderInfos(): ProviderInfo[] {
    return this.getAllProviders().map(p => {
      const caps =
        p instanceof CardigannProvider && p.definition.caps
          ? {
            CategoryMapping: p.definition.caps.categorymappings?.map(m => ({
              Cat: m.cat,
              Desc: m.desc ?? '',
              ID: m.id,
            })),
            Modes: p.definition.caps.modes,
          }
          : undefined;

      return {
        caps,
        id: p.id || p.name.toLowerCase(),
        name: p.name,
        type: p.type ?? 'public',
        urls: p.urls,
      };
    });
  }

  /**
   * Holds each definition's `requestDelay` across every process sharing `store`.
   */
  shareRequestDelays(store: RequestSlotStore): void {
    for (const provider of this.getAllProviders()) {
      if (provider instanceof CardigannProvider) {
        provider.shareRequestDelay(store);
      }
    }
  }

  /**
   * Resolves a provider by its name or identifier (case-insensitive).
   */
  getProvider(name: string): TrackerProvider | undefined {
    return this.lookup.get(name.toLowerCase());
  }

  /**
   * Retrieves the providers selected by an optional tracker filter.
   */
  getSearchProviders(targetTrackers?: string[]): TrackerProvider[] {
    const providers = this.getAllProviders();
    if (!targetTrackers || targetTrackers.length === 0) {
      return providers;
    }

    const normalizedTargets = targetTrackers.map(target => target.toLowerCase());
    return providers.filter(provider => {
      const idMatch = provider.id && normalizedTargets.includes(provider.id.toLowerCase());
      const nameMatch = normalizedTargets.includes(provider.name.toLowerCase());
      return idMatch || nameMatch;
    });
  }

  /**
   * Performs an aggregated search across all registered providers concurrently.
   */
  async searchAll(
    options: SearchOptions,
    targetTrackers?: string[]
  ): Promise<AggregatedSearchOutcome> {
    const providers = this.getSearchProviders(targetTrackers);

    const settled = await Promise.allSettled(
      providers.map(provider => provider.searchByTitle(options))
    );

    const errors: Record<string, string> = {};
    const results: Record<string, TorrentItem[]> = {};

    providers.forEach((provider, idx) => {
      const key = (provider.id || provider.name).toLowerCase();
      const outcome = settled[idx];
      if (outcome.status === 'fulfilled') {
        results[key] = outcome.value;
      } else {
        results[key] = [];
        errors[key] =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      }
    });

    return { errors, results };
  }
}
