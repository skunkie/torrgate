// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { SearchOptions } from '../../types/provider.js';
import { normalizeImdbId } from '../../utils/imdb.js';
import { MOVIES_CATEGORY_ID } from '../categories/catalog.js';
import { parseTorznabCategoryList } from '../categories/mapping.js';
import { coerceTorznabInteger, foldQueryNameCase, getTorznabQueryString, parseRequestQuery, parseTorznabInteger } from '../query.js';
import { canHandleSearch, isSearchModeAvailable, isSearchParameterSupported, TORZNAB_SEARCH_TYPE_MODES, TorznabSearchCaps, TorznabSearchRequest, TorznabSearchType } from './caps.js';
import { TORZNAB_ERROR_CODES, TorznabErrorCode } from './xml.js';

const TORZNAB_SEARCH_TYPES = new Set<string>(Object.keys(TORZNAB_SEARCH_TYPE_MODES));

/**
 * Torznab id parameters and the search options they set, in the order Jackett parses them.
 */
const TORZNAB_ID_PARAMETERS = [
  ['rid', 'rageId'],
  ['tvdbid', 'tvdbId'],
  ['tvmazeid', 'tvmazeId'],
  ['tmdbid', 'tmdbId'],
  ['traktid', 'traktId'],
  ['doubanid', 'doubanId'],
] as const;

/**
 * External ids a Torznab search carries.
 */
type TorznabSearchIds = Pick<SearchOptions, (typeof TORZNAB_ID_PARAMETERS)[number][1]>;

/**
 * Music and book search values a Torznab search carries.
 */
type TorznabSearchTexts = Pick<SearchOptions, 'album' | 'artist' | 'author' | 'genre' | 'label' | 'title' | 'track'>;

export class TorznabQueryError extends Error {
  constructor(readonly code: TorznabErrorCode, message: string) {
    super(message);
    this.name = 'TorznabQueryError';
  }
}

export function bindTorznabQuery(url: string) {
  const query = foldQueryNameCase(parseRequestQuery(url));
  const t = getTorznabQueryString(query, 't') ?? 'search';

  const season = parseTorznabInteger(getTorznabQueryString(query, 'season'));
  if (season === null) {
    throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, 'season must be an integer');
  }
  const searchIds: TorznabSearchIds = {};
  for (const [parameter, option] of TORZNAB_ID_PARAMETERS) {
    const id = parseTorznabInteger(getTorznabQueryString(query, parameter));
    if (id === null) {
      throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, `${parameter} must be an integer`);
    }
    searchIds[option] = id;
  }
  const year = parseTorznabInteger(getTorznabQueryString(query, 'year'));
  if (year === null) {
    throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, 'year must be an integer');
  }
  const requestedCategories = parseTorznabCategoryList(query);
  if (requestedCategories === null) {
    throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, 'cat must be a comma-separated list of integers');
  }

  const requestedExtended = coerceTorznabInteger(getTorznabQueryString(query, 'extended'));
  const requestedLimit = coerceTorznabInteger(getTorznabQueryString(query, 'limit'));
  const requestedOffset = coerceTorznabInteger(getTorznabQueryString(query, 'offset'));
  if (requestedExtended === null || requestedLimit === null || requestedOffset === null) {
    throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, 'extended, limit and offset must be 32-bit integers');
  }
  const extended = requestedExtended ?? 0;
  const limit = requestedLimit ?? 0;
  const offset = requestedOffset ?? 0;
  const shouldUseCache = getTorznabQueryString(query, 'cache')?.trim().toLowerCase() !== 'false';
  return { extended, limit, offset, query, requestedCategories, searchIds, season, shouldUseCache, t, year };
}

export function bindTorznabSearch(parsed: ReturnType<typeof bindTorznabQuery>, searchCaps: TorznabSearchCaps, indexerParam: string) {
  const { query, requestedCategories, searchIds, t } = parsed;
  const searchType = t as TorznabSearchType;
  const requestedImdbId = getTorznabQueryString(query, 'imdbid');
  const hasImdbId = requestedImdbId !== undefined;
  const searchRequest: TorznabSearchRequest = {
    hasImdbId,
    hasRageId: searchIds.rageId !== undefined,
    hasTvdbId: searchIds.tvdbId !== undefined,
    searchType,
  };
  if (!TORZNAB_SEARCH_TYPES.has(t) || !canHandleSearch(searchCaps, searchRequest)) {
    throw new TorznabQueryError(
      TORZNAB_ERROR_CODES.incorrectParameter,
      `${indexerParam} does not support the requested query. ` +
        'Please check the capabilities (t=caps) and make sure the search mode and parameters are supported.'
    );
  }
  const imdbId = normalizeImdbId(requestedImdbId);
  if (imdbId === null) {
    throw new TorznabQueryError(TORZNAB_ERROR_CODES.incorrectParameter, 'imdbid must be an IMDb title id such as tt0123456');
  }
  const isMovieOrTvSearch = searchType === 'movie' || searchType === 'tvsearch';
  if (hasImdbId && isMovieOrTvSearch && !isSearchParameterSupported(searchCaps, TORZNAB_SEARCH_TYPE_MODES[searchType], 'imdbid')) {
    throw new TorznabQueryError(
      TORZNAB_ERROR_CODES.functionNotAvailable,
      `Function Not Available: imdbid is not supported for ${searchType === 'movie' ? 'movie' : 'TV'} search by this indexer`
    );
  }
  if (
    searchIds.tmdbId !== undefined &&
    isMovieOrTvSearch &&
    !isSearchParameterSupported(searchCaps, TORZNAB_SEARCH_TYPE_MODES[searchType], 'tmdbid')
  ) {
    throw new TorznabQueryError(
      TORZNAB_ERROR_CODES.functionNotAvailable,
      `Function Not Available: tmdbid is not supported for ${searchType === 'movie' ? 'movie' : 'TV'} search by this indexer`
    );
  }
  if (searchIds.tvdbId !== undefined && searchType === 'tvsearch' && !isSearchModeAvailable(searchCaps, 'tv-search')) {
    throw new TorznabQueryError(
      TORZNAB_ERROR_CODES.functionNotAvailable,
      'Function Not Available: tvdbid is not supported for movie search by this indexer'
    );
  }
  const searchTexts: TorznabSearchTexts = {
    album: getTorznabQueryString(query, 'album'),
    artist: getTorznabQueryString(query, 'artist'),
    author: getTorznabQueryString(query, 'publisher') ?? getTorznabQueryString(query, 'author'),
    genre: getTorznabQueryString(query, 'genre'),
    label: getTorznabQueryString(query, 'label'),
    title: getTorznabQueryString(query, 'title'),
    track: getTorznabQueryString(query, 'track'),
  };
  const episode = getTorznabQueryString(query, 'ep');
  const searchTerm = getTorznabQueryString(query, 'q') ?? '';
  const categories = requestedCategories ?? (t === 'movie' && imdbId ? [MOVIES_CATEGORY_ID] : []);
  return { categories, episode, imdbId, searchRequest, searchTerm, searchTexts, searchType };
}
