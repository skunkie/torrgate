// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Category mapping for a torrent tracker.
 */
export interface CategoryMapping {
  id: number;
  name: string;
}

/**
 * IMDb title id in its canonical `tt` form with at least seven digits, such as `tt0123456`.
 */
export type ImdbId = `tt${string}`;

/**
 * Hex- or base32-encoded BitTorrent info hash string.
 */
export type InfoHash = string;

/**
 * Identifier string for a torrent release on a tracker.
 */
export type TorrentId = string;

/**
 * An individual torrent search result item.
 */
export interface TorrentItem {
  album?: string;
  artist?: string;
  author?: string;
  bookTitle?: string;
  /** Torznab categories accumulated from the definition fields. */
  categories?: number[];
  category: string;
  date: string;
  description?: string;
  doubanId?: number;
  /** Times the release was downloaded (grabs); absent when the definition does not report it. */
  downloadCount?: number;
  downloadVolumeFactor?: number;
  /** Number of files in the release. */
  files?: number;
  genres?: string[];
  id: TorrentId;
  imdbId?: ImdbId;
  infoHash?: InfoHash;
  label?: string;
  leechers?: number;
  magnetUri?: string;
  minimumRatio?: number;
  minimumSeedTimeSeconds?: number;
  name: string;
  posterUrl?: string;
  publisher?: string;
  /** TVRage id. */
  rageId?: number;
  seeders?: number;
  size: string;
  sizeBytes?: number;
  tmdbId?: number;
  torrentUrl: string;
  track?: string;
  traktId?: number;
  tvdbId?: number;
  tvmazeId?: number;
  uploadVolumeFactor?: number;
  url: string;
  year?: number;
}

/**
 * Individual file within a torrent release.
 */
export interface TorrentFileEntry {
  name: string;
  size: string;
  sizeBytes?: number;
}

/**
 * Fields read from a .torrent metainfo file that are needed to build a magnet URI.
 */
export interface TorrentMetainfo {
  infoHash: InfoHash;
  name?: string;
  trackers: string[];
}

/**
 * Detailed metadata for a specific topic/release.
 */
export interface TopicDetails {
  actors: string[];
  audioTranslation: string;
  category: string;
  description: string;
  director: string;
  duration: string;
  files?: TorrentFileEntry[];
  id: TorrentId;
  imdbId?: string;
  imdbUrl: string;
  infoHash: InfoHash;
  kinopoiskId?: string;
  kinopoiskUrl: string;
  magnetUri: string;
  name: string;
  posterUrl: string;
  releaseCountry: string;
  torrentUrl: string;
  url: string;
  year: string;
}
