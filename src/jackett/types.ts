// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { InfoHash } from '../types/torrent.js';

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
  ElapsedTime: number;
  Error: null | string;
  ID: string;
  Name: string;
  Results: number;
  Status: number;
}

/**
 * Individual torrent search result item.
 */
export interface JackettResultItem {
  Album: null | string;
  Artist: null | string;
  Author: null | string;
  BlackholeLink: null | string;
  BookTitle: null | string;
  Category: number[];
  CategoryDesc: string;
  Description: null | string;
  Details: null | string;
  DoubanId: null | number;
  DownloadVolumeFactor: null | number;
  Files: null | number;
  FirstSeen: string;
  Gain: null | number;
  Genres: null | string[];
  Grabs: null | number;
  Guid: string;
  Imdb: null | number;
  InfoHash: InfoHash | null;
  Label: null | string;
  Languages: string[];
  Link: null | string;
  MagnetUri: null | string;
  MinimumRatio: null | number;
  MinimumSeedTime: null | number;
  Peers: null | number;
  Poster: null | string;
  PublishDate: string;
  Publisher: null | string;
  RageID: null | number;
  Seeders: null | number;
  Size: null | number;
  Subs: string[];
  TMDb: null | number;
  TVDBId: null | number;
  TVMazeId: null | number;
  Title: string;
  Track: null | string;
  Tracker: string;
  TrackerId: string;
  TrackerType: string;
  TraktId: null | number;
  UploadVolumeFactor: null | number;
  Year: null | number;
}

/**
 * Envelope search response matching Jackett's /api/v2.0/indexers/:indexer/results.
 */
export interface JackettSearchResponse {
  Indexers: JackettIndexerStatus[];
  Results: JackettResultItem[];
}
