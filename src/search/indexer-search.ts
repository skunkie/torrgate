// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { canHandleCategories } from '../jackett/categories/mapping.js';
import { SearchOptions, TrackerProvider } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { getErrorMessage } from '../utils/error-message.js';
import { dedupeByReleaseGuid } from './result-identity.js';

/**
 * How long Jackett's aggregate indexer waits for its indexers before answering with the results
 * it has.
 */
export const AGGREGATE_SEARCH_TIMEOUT_MS = 40_000;

const BYTES_PER_GIGABYTE = 1024 ** 3;

/**
 * One search result with the indexer that returned it.
 */
export interface IndexerResult {
  item: TorrentItem;
  provider: TrackerProvider;
}

/**
 * Results of one search across indexers, with errors keyed by indexer id.
 */
export interface IndexerSearchOutcome {
  errors: Record<string, string>;
  results: IndexerResult[];
}

/**
 * How a search across indexers trims, orders, and bounds its results.
 */
export interface IndexerSearchSettings {
  /** Orders the merged results by gain, highest first, as Jackett's aggregate indexer does. */
  isOrderedByGain?: boolean;
  /** Results kept per indexer and in total; 0 keeps every result. */
  limit: number;
  /** Leaves out indexers that have not answered in time, reporting them as errors. */
  timeoutMs?: number;
}

/**
 * Runs one first-page search on every indexer admitted by its categories. Each indexer
 * keeps its first `limit` results and then drops those whose release GUID repeats an earlier
 * one's, as Jackett does. The merged results are optionally ordered by gain and then trimmed to
 * `limit` again.
 */
export async function searchIndexers(
  providers: TrackerProvider[],
  options: SearchOptions,
  settings: IndexerSearchSettings
): Promise<IndexerSearchOutcome> {
  const deadline = settings.timeoutMs === undefined ? undefined : AbortSignal.timeout(settings.timeoutMs);
  const signal = deadline && options.signal ? AbortSignal.any([options.signal, deadline]) : deadline ?? options.signal;
  const searchOptions: SearchOptions = { ...options, signal };
  const settled = await Promise.allSettled(
    providers.map(async provider => {
      if (!canHandleCategories(options.categories ?? [], provider.categoryMappings ?? [])) return [];
      return answerBefore(provider.searchByTitle({ ...searchOptions, categories: searchOptions.categories?.slice() }), deadline);
    })
  );

  const errors: Record<string, string> = {};
  const results: IndexerResult[] = [];
  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === 'rejected') {
      errors[(provider.id || provider.name).toLowerCase()] = getErrorMessage(outcome.reason, 'Upstream indexer search failed');
      return;
    }
    const items = dedupeByReleaseGuid(settings.limit > 0 ? outcome.value.slice(0, settings.limit) : outcome.value);
    results.push(...items.map(item => ({ item, provider })));
  });
  if (settings.isOrderedByGain) {
    results.sort((first, second) => compareGainDescending(first.item, second.item));
  }
  return { errors, results: settings.limit > 0 ? results.slice(0, settings.limit) : results };
}

/**
 * Settles with `search`, or rejects once `deadline` passes, whichever comes first.
 */
function answerBefore<T>(search: Promise<T>, deadline: AbortSignal | undefined): Promise<T> {
  if (!deadline) {
    return search;
  }
  return new Promise<T>((resolve, reject) => {
    const rejectLate = (): void => reject(new Error('Indexer did not answer before the search deadline'));
    deadline.addEventListener('abort', rejectLate, { once: true });
    if (deadline.aborted) {
      rejectLate();
    }
    search.then(resolve, reject).finally(() => deadline.removeEventListener('abort', rejectLate));
  });
}

/**
 * Orders by Jackett's gain, seeders times size in gigabytes, highest first; results without a
 * size or seeders have no gain and come last.
 */
function compareGainDescending(first: TorrentItem, second: TorrentItem): number {
  const firstGain = getGain(first);
  const secondGain = getGain(second);
  if (firstGain === undefined || secondGain === undefined) {
    return (firstGain === undefined ? 1 : 0) - (secondGain === undefined ? 1 : 0);
  }
  return secondGain - firstGain;
}

function getGain(item: TorrentItem): number | undefined {
  return item.sizeBytes === undefined || item.seeders === undefined ? undefined : (item.seeders * item.sizeBytes) / BYTES_PER_GIGABYTE;
}
