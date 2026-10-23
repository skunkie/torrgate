// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { ManualIndexerOutcome } from '../search/manual-search.js';
import { getReleaseGuid } from '../search/result-identity.js';
import { TrackerCategoryMapping } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { parseToIsoString } from '../utils/date.js';
import { getMagnetInfoHash } from '../utils/magnet.js';
import { getTorznabCategory } from './categories/catalog.js';
import { trackerCatToTorznabIds } from './categories/mapping.js';
import { JackettIndexerStatus, JackettResultItem, JackettSearchResponse } from './types.js';

/**
 * Transforms a TorrentItem into JackettResultItem.
 */
function toJackettResultItem(
  item: TorrentItem,
  trackerName: string,
  trackerId: string,
  mappings: TrackerCategoryMapping[],
  origin: string,
  trackerType: 'private' | 'public' | 'semi-private',
  apiKey?: string
): JackettResultItem {
  const publishDate = item.date ? parseToIsoString(item.date) : '0001-01-01T00:00:00';
  const infoHash = (item.infoHash?.trim() ? item.infoHash : getMagnetInfoHash(item.magnetUri)) ?? null;
  const catIds = item.categories ?? trackerCatToTorznabIds(item.category, mappings);

  const apiKeyParam = apiKey ? `&jackett_apikey=${encodeURIComponent(apiKey)}` : '';
  const downloadPath = item.torrentUrl
    ? `/api/v2.0/indexers/${trackerId}/download?url=${encodeURIComponent(item.torrentUrl)}${apiKeyParam}`
    : null;
  const downloadLink = origin && downloadPath
    ? `${origin}${downloadPath}`
    : downloadPath;

  const sizeBytes = item.sizeBytes ?? null;
  const gain = sizeBytes === null || item.seeders === undefined ? null : item.seeders * (sizeBytes / 1024 / 1024 / 1024);

  return {
    Album: item.album ?? null,
    Artist: item.artist ?? null,
    Author: item.author ?? null,
    BlackholeLink: null,
    BookTitle: item.bookTitle ?? null,
    Category: catIds,
    CategoryDesc: catIds.map(id => getTorznabCategory(id)?.name).filter(Boolean).join(', '),
    Description: item.description ?? null,
    Details: item.url || null,
    DoubanId: item.doubanId ?? null,
    DownloadVolumeFactor: item.downloadVolumeFactor ?? null,
    Files: item.files ?? null,
    FirstSeen: '0001-01-01T00:00:00',
    Gain: gain,
    Genres: item.genres ?? null,
    Grabs: item.downloadCount ?? null,
    Guid: getReleaseGuid(item),
    Imdb: item.imdbId === undefined ? null : Number(item.imdbId.slice(2)),
    InfoHash: infoHash,
    Label: item.label ?? null,
    Languages: [],
    Link: downloadLink,
    MagnetUri: item.magnetUri || null,
    MinimumRatio: item.minimumRatio ?? null,
    MinimumSeedTime: item.minimumSeedTimeSeconds ?? null,
    Peers: item.seeders === undefined ? null : item.leechers ?? 0,
    Poster: item.posterUrl || null,
    PublishDate: publishDate,
    Publisher: item.publisher ?? null,
    RageID: item.rageId ?? null,
    Seeders: item.seeders ?? null,
    Size: sizeBytes,
    Subs: [],
    TMDb: item.tmdbId ?? null,
    TVDBId: item.tvdbId ?? null,
    TVMazeId: item.tvmazeId ?? null,
    Title: item.name,
    Track: item.track ?? null,
    Tracker: trackerName,
    TrackerId: trackerId,
    TrackerType: trackerType,
    TraktId: item.traktId ?? null,
    UploadVolumeFactor: item.uploadVolumeFactor ?? null,
    Year: item.year ?? null,
  };
}

export function toJackettSearchResponse(settled: ManualIndexerOutcome[], origin: string, apiKey?: string): JackettSearchResponse {
  const allResults: JackettResultItem[] = [];
  const indexerStatuses: JackettIndexerStatus[] = [];
  for (const { elapsedTimeMs, error, items, provider } of settled) {
    const providerId = provider.id ?? provider.name.toLowerCase();
    indexerStatuses.push({
      ElapsedTime: elapsedTimeMs,
      Error: error,
      ID: providerId,
      Name: provider.name,
      Results: items.length,
      Status: error === null ? 2 : 1,
    });
    for (const item of items) {
      allResults.push(toJackettResultItem(
        item, provider.name, providerId, provider.categoryMappings ?? [], origin, provider.type ?? 'public', apiKey
      ));
    }
  }
  allResults.sort((first, second) => Date.parse(second.PublishDate) - Date.parse(first.PublishDate));
  return { Indexers: indexerStatuses, Results: allResults };
}
