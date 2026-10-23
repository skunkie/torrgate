// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { canHandleCategories } from '../jackett/categories/mapping.js';
import { SearchOptions, TrackerProvider } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { getErrorMessage } from '../utils/error-message.js';
import { dedupeByReleaseGuid } from './result-identity.js';

export interface ManualIndexerOutcome {
  elapsedTimeMs: number;
  error: null | string;
  items: TorrentItem[];
  provider: TrackerProvider;
}

export async function searchManualIndexers(providers: TrackerProvider[], options: SearchOptions): Promise<ManualIndexerOutcome[]> {
  return Promise.all(providers.map(async provider => {
    if (!canHandleCategories(options.categories ?? [], provider.categoryMappings ?? [])) {
      return { elapsedTimeMs: 0, error: null, items: [], provider };
    }
    const startedAtMs = Date.now();
    try {
      const items = dedupeByReleaseGuid(await provider.searchByTitle({ ...options, categories: options.categories?.slice() }));
      return { elapsedTimeMs: Date.now() - startedAtMs, error: null, items, provider };
    } catch (err) {
      return { elapsedTimeMs: 0, error: getErrorMessage(err, 'Upstream indexer search failed'), items: [], provider };
    }
  }));
}
