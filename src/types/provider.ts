// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { JackettIndexerCaps } from './jackett.js';
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
  responseTimeMs?: number;
}

/**
 * Standard search query parameters for providers.
 */
export interface SearchOptions {
  /** Requested Torznab category ids (standard or tracker-specific `100000 + id`). */
  categories?: number[];
  format?: number;
  page?: number;
  query: string;
  signal?: AbortSignal;
  year?: number;
}

/**
 * One provider result page together with enough metadata to continue paging safely.
 */
export interface SearchPage {
  hasMore: boolean;
  items: TorrentItem[];
  pageIdentity?: string;
}

/**
 * A downloaded .torrent file and the file name the tracker gave it.
 */
export interface TorrentFile {
  data: Buffer;
  fileName: string;
}

/**
 * Contract implemented by each tracker scraper module.
 */
export interface TrackerProvider {
  checkAvailability(): Promise<ProviderCheckResult>;
  /** Fetches a .torrent file from one of the tracker's hosts, rejecting non-torrent responses. */
  downloadTorrent(url: string): Promise<TorrentFile>;
  getTopicDetails(id: string): Promise<TopicDetails | null>;
  readonly id?: string;
  readonly name: ProviderName;
  searchByTitle(options: SearchOptions): Promise<TorrentItem[]>;
  searchPageByTitle?(options: SearchOptions): Promise<SearchPage>;
  readonly type?: 'private' | 'public' | 'semi-private';
  readonly urls: string[];
}
