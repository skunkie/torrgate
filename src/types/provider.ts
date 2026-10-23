// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CacheWrite } from '../cache/store.js';
import { TorznabSearchCaps, TorznabSearchType } from '../jackett/torznab/caps.js';
import { JackettIndexerCaps } from '../jackett/types.js';
import { TopicDetails, TorrentItem } from './torrent.js';

/**
 * Torrent tracker provider identifier or name.
 */
export type ProviderName = string;

/**
 * Provider metadata including mirror URLs.
 */
export interface ProviderInfo {
  caps?: JackettIndexerCaps;
  id?: string;
  isConfigured?: boolean;
  name: ProviderName;
  type?: 'private' | 'public' | 'semi-private';
  urls: string[];
}

/**
 * Status and connectivity result for a provider.
 */
export interface ProviderCheckResult {
  isAvailable: boolean;
  name: ProviderName;
}

/**
 * Standard search query parameters for providers.
 */
export interface SearchOptions {
  /** Torznab music search `album`, passed to definitions as `.Query.Album`. */
  album?: string;
  /** Torznab music search `artist`, passed to definitions as `.Query.Artist`. */
  artist?: string;
  /** Torznab book search `author`, or `publisher` when given, passed to definitions as `.Query.Author`. */
  author?: string;
  /** Requested category IDs advertised in Torznab caps. */
  categories?: number[];
  /** Torznab `doubanid`, passed to definitions as `.Query.DoubanID`. */
  doubanId?: number;
  /** Raw Torznab `ep` value, such as `2`, `01A`, or a daily-show `MM/dd` air date. */
  episode?: string;
  /** Jackett extended response flag, coerced to a 32-bit integer. */
  extended?: number;
  format?: number;
  /** Torznab `genre`, passed to definitions as `.Query.Genre`. */
  genre?: string;
  /** IMDb query value; Torznab normalizes it, while manual search preserves model binding. */
  imdbId?: string;
  /** Torznab music search `label`, passed to definitions as `.Query.Label`. */
  label?: string;
  /** Requested result limit, exposed as a decimal string to Cardigann templates. */
  limit?: number;
  /** Requested result offset, exposed as a decimal string to Cardigann templates. */
  offset?: number;
  /** Search term without the episode tag, which providers build from `season` and `episode`. */
  query: string;
  /** Torznab TVRage id (`rid`), passed to definitions as `.Query.TVRageID`. */
  rageId?: number;
  /** Torznab request type, which definitions see as `.Query.Type`; defaults to `search`. */
  searchType?: TorznabSearchType;
  /** Torznab `season` value; definitions see it as `.Query.Season` when it is positive. */
  season?: number;
  /**
   * Whether to drop releases without a size or a category, as Jackett does outside interactive
   * searches. Torznab searches set it; JSON searches, which Jackett runs as interactive, do not.
   */
  shouldDropIncompleteReleases?: boolean;
  signal?: AbortSignal;
  /** Torznab book search `title`, passed to definitions as `.Query.Title`. */
  title?: string;
  /** Torznab `tmdbid`, passed to definitions as `.Query.TMDBID`. */
  tmdbId?: number;
  /** Torznab music search `track`, passed to definitions as `.Query.Track`. */
  track?: string;
  /** Torznab `traktid`, passed to definitions as `.Query.TraktID`. */
  traktId?: number;
  /** Torznab `tvdbid`, passed to definitions as `.Query.TVDBID`. */
  tvdbId?: number;
  /** Torznab `tvmazeid`, passed to definitions as `.Query.TVMazeID`. */
  tvmazeId?: number;
  year?: number;
}

/**
 * A downloaded .torrent file and the file name the tracker gave it.
 */
export interface TorrentDownload {
  data: Buffer;
  fileName: string;
}

/**
 * Contract implemented by each tracker scraper module.
 */
export interface TrackerProvider {
  readonly caps?: JackettIndexerCaps;
  readonly categoryMappings?: TrackerCategoryMapping[];
  checkAvailability(): Promise<ProviderCheckResult>;
  /** What the indexer offers, from its definition. */
  readonly description?: string;
  /** Fetches a .torrent file from one of the tracker's hosts, rejecting non-torrent responses. */
  downloadTorrent(url: string): Promise<TorrentDownload>;
  getTopicDetails(id: string): Promise<TopicDetails | null>;
  /** Returns a searched result's recorded topic path for inclusion in response caches. */
  getTopicPathCacheEntry?(item: TorrentItem): CacheWrite<string> | undefined;
  readonly id?: string;
  readonly isConfigured?: boolean;
  readonly language?: string;
  readonly name: ProviderName;
  restoreTopicPaths?(entries: readonly CacheWrite<string>[]): void;
  searchByTitle(options: SearchOptions): Promise<TorrentItem[]>;
  /** Torznab search capabilities the provider declares. */
  readonly searchCaps?: TorznabSearchCaps;
  readonly type?: 'private' | 'public' | 'semi-private';
  readonly urls: string[];
}

/** Category mapping advertised by a tracker provider. */
export interface TrackerCategoryMapping {
  cat: string;
  desc?: string;
  id: number | string;
}
