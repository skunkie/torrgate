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
 * Hex-encoded BitTorrent info hash string.
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
  category: string;
  date: string;
  downloadCount: number;
  id: TorrentId;
  infoHash?: InfoHash;
  leechers: number;
  magnetUri?: string;
  name: string;
  seeders: number;
  size: string;
  sizeBytes?: number;
  torrentUrl: string;
  url: string;
}

/**
 * Individual file within a torrent release.
 */
export interface TorrentFile {
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
  files?: TorrentFile[];
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
