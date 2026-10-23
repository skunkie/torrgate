// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { InfoHash } from './torrent.js';

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
