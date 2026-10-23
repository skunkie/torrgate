// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { SearchOptions } from '../types/provider.js';
import { parseImdbIdSearchTerm } from '../utils/imdb.js';
import { foldQueryNameCase, getTorznabQueryString, parseRequestQuery, parseTorznabInteger } from './query.js';
import { parseEpisodeSearchQuery } from './torznab/episode.js';

function queryValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === 'string');
}

export function bindManualSearchQuery(url: string) {
  const rawQuery = parseRequestQuery(url);
  const boundQuery = foldQueryNameCase(rawQuery);
  const { episode, query: searchTerm, season } = parseEpisodeSearchQuery(getTorznabQueryString(boundQuery, 'query') ?? '');
  const queryImdbId = parseImdbIdSearchTerm(searchTerm);
  const query = queryImdbId ? '' : searchTerm;
  const imdbId = queryImdbId ?? getTorznabQueryString(boundQuery, 'imdbid');
  const searchIds: Pick<SearchOptions, 'doubanId' | 'rageId' | 'tmdbId' | 'traktId' | 'tvdbId' | 'tvmazeId'> = {};
  if (!queryImdbId) {
    for (const [parameter, option] of [
      ['doubanid', 'doubanId'],
      ['rageid', 'rageId'],
      ['tmdbid', 'tmdbId'],
      ['traktid', 'traktId'],
      ['tvdbid', 'tvdbId'],
      ['tvmazeid', 'tvmazeId'],
    ] as const) {
      searchIds[option] = parseTorznabInteger(getTorznabQueryString(boundQuery, parameter)) ?? undefined;
    }
  }
  // The action parses these raw, case-sensitive keys after model binding.
  for (const parameter of ['tmdbid', 'tvdbid', 'tvmazeid']) {
    if (rawQuery.has(parameter)) {
      const raw = rawQuery.getAll(parameter).join(',');
      if (parseTorznabInteger(raw) == null) throw new Error(`${parameter} must be an integer`);
    }
  }
  const categoryValues = !rawQuery.has('Category[]')
    ? queryValues(boundQuery.category ?? boundQuery['category[]'])
    : rawQuery.getAll('Category[]').join(',').split(',');
  const categories: number[] = [];
  for (const value of categoryValues) {
    const category = parseTorznabInteger(value);
    if (category == null) {
      if (rawQuery.has('Category[]')) throw new Error('Category[] must contain integers');
    } else {
      categories.push(category);
    }
  }
  const targetTrackers = !rawQuery.has('Tracker[]')
    ? undefined
    : rawQuery.getAll('Tracker[]').join(',').split(',');
  const options: SearchOptions = { ...searchIds, categories, episode, imdbId, query, season };
  return {
    options,
    searchIds,
    targetTrackers,
  };
}
