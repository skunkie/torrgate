// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * A Torznab search mode as named in caps and in Cardigann definitions.
 */
export type TorznabSearchMode = 'book-search' | 'movie-search' | 'music-search' | 'search' | 'tv-search';

/**
 * The parameters a provider accepts in each search mode its definition declares.
 */
export type TorznabSearchModes = Readonly<Partial<Record<TorznabSearchMode, readonly string[]>>>;

/**
 * An indexer's Torznab search capabilities, modeled on Jackett's `TorznabCapabilities`.
 */
export interface TorznabSearchCaps {
  /** Parameters each search mode declares; a mode with none is unavailable. */
  readonly modes: TorznabSearchModes;
  /** Whether the indexer searches raw keywords, advertised as `searchEngine="raw"`. */
  readonly supportsRawSearch: boolean;
  /** Whether TV search accepts `imdbid`, which Jackett decides by this flag alone. */
  readonly supportsTvImdbSearch: boolean;
}

/**
 * A Torznab request type (`t`) that runs a search.
 */
export type TorznabSearchType = 'book' | 'movie' | 'music' | 'search' | 'tvsearch';

/**
 * Result count advertised as both the default and the maximum in an indexer's caps, as Jackett does.
 */
export const TORZNAB_CAPS_LIMIT = 100;

/**
 * Result count Jackett's aggregate indexer advertises as both the default and the maximum.
 */
export const TORZNAB_AGGREGATE_CAPS_LIMIT = 1000;

/**
 * Parameters each search mode can declare, in the order Jackett lists them in caps.
 */
export const TORZNAB_SEARCH_MODE_PARAMETERS: Readonly<Record<TorznabSearchMode, readonly string[]>> = {
  'book-search': ['q', 'title', 'author', 'publisher', 'year', 'genre'],
  'movie-search': ['q', 'imdbid', 'tmdbid', 'traktid', 'doubanid', 'year', 'genre'],
  'music-search': ['q', 'album', 'artist', 'label', 'track', 'year', 'genre'],
  'search': ['q'],
  'tv-search': ['q', 'season', 'ep', 'imdbid', 'tvdbid', 'rid', 'tmdbid', 'tvmazeid', 'traktid', 'doubanid', 'year', 'genre'],
};

/**
 * The search mode each searching request type uses.
 */
export const TORZNAB_SEARCH_TYPE_MODES: Readonly<Record<TorznabSearchType, TorznabSearchMode>> = {
  book: 'book-search',
  movie: 'movie-search',
  music: 'music-search',
  search: 'search',
  tvsearch: 'tv-search',
};

const SEARCH_MODES = Object.keys(TORZNAB_SEARCH_MODE_PARAMETERS) as TorznabSearchMode[];

/**
 * Capabilities of an indexer that declares no search modes: basic search only.
 */
export const BASIC_SEARCH_CAPS: TorznabSearchCaps = Object.freeze({
  modes: Object.freeze({}),
  supportsRawSearch: false,
  supportsTvImdbSearch: false,
});

/**
 * Reads a definition's `caps.modes`, keeping the parameters each mode supports in Jackett's
 * order and matching their names case-insensitively.
 */
export function parseSearchModes(modes: Readonly<Record<string, unknown>> | undefined): TorznabSearchModes {
  const parsed: Partial<Record<TorznabSearchMode, readonly string[]>> = {};
  for (const mode of SEARCH_MODES) {
    const declared = modes?.[mode];
    if (!Array.isArray(declared)) {
      continue;
    }
    const names = new Set(declared.map(name => String(name).toLowerCase()));
    parsed[mode] = TORZNAB_SEARCH_MODE_PARAMETERS[mode].filter(parameter => names.has(parameter));
  }
  return parsed;
}

/**
 * Combines the capabilities of several indexers as Jackett's aggregate indexer does: modes and
 * parameters are united and raw search is kept, but TV IMDb search is never carried over.
 */
export function mergeSearchCaps(providerCaps: readonly TorznabSearchCaps[]): TorznabSearchCaps {
  const modes: Partial<Record<TorznabSearchMode, readonly string[]>> = {};
  for (const mode of SEARCH_MODES) {
    if (!providerCaps.some(caps => caps.modes[mode] !== undefined)) {
      continue;
    }
    modes[mode] = TORZNAB_SEARCH_MODE_PARAMETERS[mode].filter(parameter =>
      providerCaps.some(caps => caps.modes[mode]?.includes(parameter))
    );
  }
  return {
    modes,
    supportsRawSearch: providerCaps.some(caps => caps.supportsRawSearch),
    supportsTvImdbSearch: false,
  };
}

/**
 * Whether a search mode is available. Basic search always is; other modes need at least one
 * declared parameter.
 */
export function isSearchModeAvailable(caps: TorznabSearchCaps, mode: TorznabSearchMode): boolean {
  return mode === 'search' || (caps.modes[mode]?.length ?? 0) > 0;
}

/**
 * Whether a search mode accepts a parameter. `q` always is; TV search accepts `imdbid` only
 * with TV IMDb search, whatever its declared parameters.
 */
export function isSearchParameterSupported(
  caps: TorznabSearchCaps,
  mode: TorznabSearchMode,
  parameter: string
): boolean {
  if (mode === 'tv-search' && parameter === 'imdbid') {
    return caps.supportsTvImdbSearch;
  }
  return parameter === 'q' || (caps.modes[mode]?.includes(parameter) ?? false);
}

/**
 * Whether an indexer searches by IMDb id in movie or TV search, which Jackett requires before
 * it skips keyword matching for IMDb, Douban, and Trakt searches.
 */
export function hasImdbSearch(caps: TorznabSearchCaps): boolean {
  return isSearchParameterSupported(caps, 'movie-search', 'imdbid') || caps.supportsTvImdbSearch;
}

/**
 * Lists the parameters a search mode advertises in caps: always `q`, then the supported ones.
 */
export function getSupportedSearchParameters(caps: TorznabSearchCaps, mode: TorznabSearchMode): string[] {
  return TORZNAB_SEARCH_MODE_PARAMETERS[mode].filter(parameter =>
    isSearchParameterSupported(caps, mode, parameter)
  );
}

/**
 * The parts of a Torznab search request that decide whether an indexer can answer it.
 */
export interface TorznabSearchRequest {
  hasImdbId: boolean;
  hasRageId: boolean;
  hasTvdbId: boolean;
  searchType: TorznabSearchType;
}

/**
 * Decides whether an indexer can answer a search, following the order of Jackett's
 * `CanHandleQuery`: an IMDb search in TV or movie search first, then the request's own search
 * mode, then a TVRage, TVDB, or IMDb id the indexer accepts in some other mode.
 */
export function canHandleSearch(caps: TorznabSearchCaps, request: TorznabSearchRequest): boolean {
  const hasMovieImdbSearch = isSearchParameterSupported(caps, 'movie-search', 'imdbid');
  if (request.hasImdbId && request.searchType === 'tvsearch' && caps.supportsTvImdbSearch) {
    return true;
  }
  if (request.hasImdbId && request.searchType === 'movie') {
    return hasMovieImdbSearch;
  }
  if (isSearchModeAvailable(caps, TORZNAB_SEARCH_TYPE_MODES[request.searchType])) {
    return true;
  }
  return (
    (request.hasRageId && isSearchParameterSupported(caps, 'tv-search', 'rid')) ||
    (request.hasTvdbId && isSearchParameterSupported(caps, 'tv-search', 'tvdbid')) ||
    (request.hasImdbId && hasMovieImdbSearch)
  );
}
