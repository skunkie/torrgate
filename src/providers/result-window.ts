// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { SearchOptions, SearchPage, TrackerProvider } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { getTorrentResultIdentity } from './result-identity.js';

/**
 * Most rounds of tracker page requests one window may take, bounding the upstream load a
 * single deep `offset` can cause.
 */
export const MAX_WINDOW_PAGE_ROUNDS = 10;

/**
 * A slice of search results by position: `limit` results starting at `offset`.
 */
export interface ResultWindow {
  limit: number;
  offset: number;
}

/**
 * One result inside a window, with the indexer that returned it.
 */
export interface WindowedResult {
  item: TorrentItem;
  provider: TrackerProvider;
}

/**
 * Results inside the window, errors keyed by indexer id, and collection status.
 */
export interface ResultWindowOutcome {
  errors: Record<string, string>;
  isTruncated: boolean;
  results: WindowedResult[];
  successfulCount: number;
}

/**
 * Collects results from position `offset` of a search across `providers`, at most `limit`
 * of them.
 *
 * Results are ordered page by page: every indexer's page 0 in `providers` order, then every
 * indexer's page 1, and so on. Pages are fetched round by round until the window is full or
 * every indexer is exhausted. Collection reports truncation if the page-round safety limit is
 * reached before either condition is met.
 */
export async function collectResultWindow(
  providers: TrackerProvider[],
  options: SearchOptions,
  window: ResultWindow
): Promise<ResultWindowOutcome> {
  const windowEnd = window.offset + window.limit;
  const errors: Record<string, string> = {};
  const failedProviders = new Set<TrackerProvider>();
  const results: WindowedResult[] = [];
  const seenKeys = new Map<TrackerProvider, Set<string>>();
  const seenPages = new Map<TrackerProvider, Set<string>>();

  let activeProviders = providers;
  let pageIndex = 0;
  let position = 0;

  for (let round = 0; round < MAX_WINDOW_PAGE_ROUNDS && activeProviders.length > 0 && results.length < window.limit; round++) {
    const settled = await Promise.allSettled(
      activeProviders.map(provider => searchProviderPage(provider, { ...options, page: pageIndex }))
    );

    const nextProviders: TrackerProvider[] = [];
    activeProviders.forEach((provider, index) => {
      const outcome = settled[index];
      if (outcome.status === 'rejected') {
        failedProviders.add(provider);
        errors[providerKey(provider)] =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        return;
      }

      const page = outcome.value;
      const providerSeenPages = seenPages.get(provider) ?? new Set<string>();
      seenPages.set(provider, providerSeenPages);
      if (page.pageIdentity && providerSeenPages.has(page.pageIdentity)) {
        return;
      }
      if (page.pageIdentity) {
        providerSeenPages.add(page.pageIdentity);
      }

      const seen = seenKeys.get(provider) ?? new Set<string>();
      seenKeys.set(provider, seen);
      const newItems = page.items.filter(item => {
        const key = getTorrentResultIdentity(item);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      for (const item of newItems) {
        if (position >= window.offset && position < windowEnd) {
          results.push({ item, provider });
        }
        position++;
      }

      if (page.hasMore && (page.pageIdentity !== undefined || newItems.length > 0)) {
        nextProviders.push(provider);
      }
    });

    activeProviders = nextProviders;
    pageIndex++;
  }

  const isTruncated = activeProviders.length > 0 && results.length < window.limit;
  const successfulCount = providers.length - failedProviders.size;
  return { errors, isTruncated, results, successfulCount };
}

async function searchProviderPage(provider: TrackerProvider, options: SearchOptions): Promise<SearchPage> {
  if (provider.searchPageByTitle) {
    return provider.searchPageByTitle(options);
  }
  const items = await provider.searchByTitle(options);
  return { hasMore: items.length > 0, items };
}

function providerKey(provider: TrackerProvider): string {
  return (provider.id || provider.name).toLowerCase();
}
