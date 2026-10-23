// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { torznabCatToTrackerIds } from '../../jackett/categories/mapping.js';
import { formatEpisodeSearchString } from '../../jackett/torznab/episode.js';
import { SearchOptions } from '../../types/provider.js';
import { getDefinitionCategoryMappings } from './categories.js';
import { applyFilters } from './filters.js';
import { CardigannDefinition, TemplateContext, TemplateFlag } from './types.js';

/**
 * Renders a Torznab id as Jackett's templates see it: its decimal value, or empty when absent.
 */
function formatOptionalId(id: number | undefined): string | undefined {
  return id === undefined ? undefined : String(id);
}

/**
 * Renders a request flag as Jackett's templates see it.
 */
function toTemplateFlag(holds: boolean): TemplateFlag {
  return holds ? 'True' : undefined;
}

/**
 * Returns the `.Today.Year` value: the previous year during January, as in Jackett, so that
 * definitions browsing by year still find releases early in a new year.
 */
function getTemplateTodayYear(date: Date): number {
  return date.getMonth() > 0 ? date.getFullYear() : date.getFullYear() - 1;
}

export function createSearchContext(definition: CardigannDefinition, settings: Record<string, boolean | number | string>, options: SearchOptions, date = new Date()): TemplateContext {
  const config: Record<string, boolean | number | string> = { ...settings };

  const episodeSearchString = formatEpisodeSearchString(options.season, options.episode);
  const year = options.year === undefined ? undefined : String(options.year);
  const queryKeywords = [options.query, year ?? '', episodeSearchString]
    .filter(token => token.trim() !== '')
    .join(' ');
  const searchType = options.searchType ?? 'search';
  const isIdSearch =
    Boolean(options.episode?.trim()) ||
    (options.season ?? 0) > 0 ||
    [options.imdbId, options.tvdbId, options.rageId, options.traktId, options.tvmazeId, options.tmdbId, options.doubanId]
      .some(id => id !== undefined) ||
    [options.album, options.artist, options.label, options.genre, options.track, options.author, options.title]
      .some(value => Boolean(value?.trim())) ||
    options.year !== undefined;
  const query: NonNullable<TemplateContext['Query']> = {
    APIKey: undefined,
    Album: options.album,
    Artist: options.artist,
    Author: options.author,
    Categories: options.categories ?? [],
    DoubanID: formatOptionalId(options.doubanId),
    Ep: options.episode,
    Episode: episodeSearchString,
    Extended: String(options.extended ?? 0),
    Format: options.format,
    Genre: options.genre,
    IMDBID: options.imdbId,
    IMDBIDShort: options.imdbId?.replace(/^t+/, ''),
    IsBookSearch: toTemplateFlag(searchType === 'book'),
    IsDoubanQuery: toTemplateFlag(options.doubanId !== undefined),
    IsGenreQuery: toTemplateFlag(options.genre !== undefined),
    IsIdSearch: toTemplateFlag(isIdSearch),
    IsImdbQuery: toTemplateFlag(options.imdbId !== undefined),
    IsMovieSearch: toTemplateFlag(searchType === 'movie'),
    IsMusicSearch: toTemplateFlag(searchType === 'music'),
    IsRssSearch: toTemplateFlag(!options.query.trim() && !isIdSearch),
    IsSearch: toTemplateFlag(searchType === 'search'),
    IsTVRageQuery: toTemplateFlag(options.rageId !== undefined),
    IsTVSearch: toTemplateFlag(searchType === 'tvsearch'),
    IsTmdbQuery: toTemplateFlag(options.tmdbId !== undefined),
    IsTraktQuery: toTemplateFlag(options.traktId !== undefined),
    IsTvdbQuery: toTemplateFlag(options.tvdbId !== undefined),
    IsTvmazeQuery: toTemplateFlag(options.tvmazeId !== undefined),
    Keywords: queryKeywords,
    Label: options.label,
    Limit: String(options.limit ?? 0),
    Movie: undefined,
    Offset: String(options.offset ?? 0),
    Q: options.query,
    Season: (options.season ?? 0) > 0 ? String(options.season) : undefined,
    Series: undefined,
    TMDBID: formatOptionalId(options.tmdbId),
    TVDBID: formatOptionalId(options.tvdbId),
    TVMazeID: formatOptionalId(options.tvmazeId),
    TVRageID: formatOptionalId(options.rageId),
    Title: options.title,
    Track: options.track,
    TraktID: formatOptionalId(options.traktId),
    Type: searchType,
    Year: year,
  };
  const today = { Year: getTemplateTodayYear(date) };
  const keywords = definition.search.keywordsfilters
    ? applyFilters(queryKeywords, definition.search.keywordsfilters, {
      Config: config,
      Keywords: queryKeywords,
      Query: query,
      Today: today,
    })
    : queryKeywords;

  const mappings = getDefinitionCategoryMappings(definition.caps);
  const requestedCategories = options.categories ?? [];
  const trackerCategoryIds =
    requestedCategories.length > 0 ? torznabCatToTrackerIds(requestedCategories, mappings) : [];
  // Legacy single-category templates search broadly when several categories match.
  const singleCategory = trackerCategoryIds.length === 1 ? trackerCategoryIds[0] : 0;

  return {
    Categories: trackerCategoryIds,
    Category: singleCategory,
    Config: config,
    Keywords: keywords,
    Query: { ...query, Category: singleCategory, Query: keywords },
    Today: today,
  };
}
