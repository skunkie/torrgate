// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { InfoHash, TorrentItem } from './torrent.js';

/**
 * Standard API error response schema.
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  success: false;
}

/**
 * Outcome of an aggregated search containing results and errors keyed by provider id.
 */
export interface AggregatedSearchOutcome {
  errors: Record<string, string>;
  results: AggregatedSearchResult;
}

/**
 * Aggregated search result keyed by provider id.
 */
export type AggregatedSearchResult = Record<string, TorrentItem[]>;

/**
 * Magnet URI built from a tracker's .torrent file, with PascalCase keys matching the
 * `InfoHash` and `MagnetUri` fields of Jackett search results.
 */
export interface MagnetResponse {
  InfoHash: InfoHash;
  MagnetUri: string;
}

/**
 * Map of availability statuses for all registered providers.
 */
export type ProviderStatusMap = Record<string, boolean>;
