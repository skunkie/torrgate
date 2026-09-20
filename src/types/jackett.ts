// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { InfoHash } from './torrent.js';

/**
 * Capability mappings defined for an indexer in Jackett.
 */
export interface JackettIndexerCaps {
  CategoryMapping?: Array<{
    Cat: string;
    Desc: string;
    ID: number | string;
  }>;
  Modes?: Record<string, string[]>;
}

/**
 * Indexer configuration model for /api/v2.0/indexers.
 */
export interface JackettIndexer {
  caps: JackettIndexerCaps;
  configured: boolean;
  id: string;
  links: string[];
  name: string;
  site_link: string;
  type: string;
}

/**
 * Status representation for an indexer within a search response.
 * Status values follow Jackett's ManualSearchResultIndexerStatus enum: 0 = Unknown, 1 = Error, 2 = OK.
 */
export interface JackettIndexerStatus {
  ElapsedTime?: number;
  Error?: null | string;
  ID: string;
  Name: string;
  Results: number;
  Status: number;
}

/**
 * Individual torrent search result item.
 */
export interface JackettResultItem {
  BlackholeLink?: null | string;
  Category: number[];
  CategoryDesc: string;
  Description?: null | string;
  Details: string;
  DownloadVolumeFactor: number;
  Files?: null | number;
  FirstSeen?: string;
  Gain?: number;
  Grabs?: null | number;
  Guid: string;
  InfoHash?: InfoHash | null;
  Link?: null | string;
  MagnetUri?: null | string;
  MinimumRatio?: number;
  MinimumSeedTime?: number;
  Peers: number;
  PublishDate: string;
  RssId?: null | string;
  Seeders: number;
  Size: number;
  Title: string;
  Tracker: string;
  TrackerId: string;
  TrackerType: string;
  UploadVolumeFactor: number;
}

/**
 * Envelope search response matching Jackett's /api/v2.0/indexers/:indexer/results.
 */
export interface JackettSearchResponse {
  Indexers: JackettIndexerStatus[];
  Results: JackettResultItem[];
}
