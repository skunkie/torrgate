// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { INT32_MAX } from '../query.js';

const DAILY_EPISODE_PATTERN = /^(\d{2})\/(\d{2})$/;
/**
 * A word boundary before the tag, using .NET's Unicode word characters: letters, nonspacing
 * marks, decimal digits, and connector punctuation.
 */
const TAG_START = String.raw`(?<![\p{L}\p{Mn}\p{Nd}\p{Pc}])`;
const TRAILING_SEASON_EPISODE_PATTERN = new RegExp(String.raw`${TAG_START}S(\d{2,4})E(\d{2,4}[A-Za-z]?)$`, 'u');
const TRAILING_EPISODE_PATTERN = new RegExp(String.raw`${TAG_START}E(\d{2,4}[A-Za-z]?)$`, 'u');
const TRAILING_SEASON_PATTERN = new RegExp(String.raw`${TAG_START}S(\d{2,4})$`, 'u');

/**
 * Search term, season, and episode read from a free-text query.
 */
export interface EpisodeSearchQuery {
  episode?: string;
  query: string;
  season?: number;
}

/**
 * Builds the episode tag Jackett appends to search keywords: `Sxx`, `SxxEyy`, or a
 * `yyyy.MM.dd` air date when a four-digit season and an `MM/dd` episode form a valid date.
 * Returns an empty string when no season, or season 0, is requested.
 *
 * Episode numbers are read from the digits in `ep`, so `01A` searches episode 1; an `ep`
 * with separators but no digits, or one too large to be an episode number, is kept verbatim.
 */
export function formatEpisodeSearchString(season: number | undefined, episode: string | undefined): string {
  if (!season) {
    return '';
  }

  const airDate = formatAirDate(season, episode);
  if (airDate) {
    return airDate;
  }

  const seasonTag = `S${padTwoDigits(season)}`;
  if (!episode?.trim()) {
    return seasonTag;
  }

  const numericText = episode.replace(/[^\d.,]/g, '');
  const digits = numericText.replace(/[.,]/g, '');
  if (numericText !== '' && digits === '') {
    return `${seasonTag}E${episode}`;
  }
  const episodeNumber = digits === '' ? 0 : Number(digits);
  return episodeNumber <= INT32_MAX
    ? `${seasonTag}E${padTwoDigits(episodeNumber)}`
    : `${seasonTag}E${episode}`;
}

/**
 * Splits a trailing `SxxEyy`, `Eyy`, or `Sxx` tag (an `Sxx` may precede an `Eyy` tag) from a
 * free-text query as Jackett's JSON search does. The episode keeps an optional letter suffix
 * and loses its leading zeros, so `S01E02A` yields season 1 and episode `2A`.
 */
export function parseEpisodeSearchQuery(raw: string): EpisodeSearchQuery {
  let query = raw.trim();
  if (!query) {
    return { query };
  }

  const seasonEpisodeMatch = TRAILING_SEASON_EPISODE_PATTERN.exec(query);
  if (seasonEpisodeMatch) {
    return {
      episode: trimLeadingZeros(seasonEpisodeMatch[2]),
      query: query.slice(0, seasonEpisodeMatch.index).trim(),
      season: Number(seasonEpisodeMatch[1]),
    };
  }

  let episode: string | undefined;
  const episodeMatch = TRAILING_EPISODE_PATTERN.exec(query);
  if (episodeMatch) {
    episode = trimLeadingZeros(episodeMatch[1]);
    query = query.slice(0, episodeMatch.index).trim();
  }

  let season: number | undefined;
  const seasonMatch = TRAILING_SEASON_PATTERN.exec(query);
  if (seasonMatch) {
    season = Number(seasonMatch[1]);
    query = query.slice(0, seasonMatch.index).trim();
  }

  return { episode, query, season };
}

function trimLeadingZeros(value: string): string {
  return value.replace(/^0+/, '');
}

function formatAirDate(season: number, episode: string | undefined): string | undefined {
  const match = episode?.match(DAILY_EPISODE_PATTERN);
  if (!match || season < 1000 || season > 9999) {
    return undefined;
  }
  const [, month, day] = match;
  const date = new Date(Date.UTC(season, Number(month) - 1, Number(day)));
  const isValidDate = date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
  return isValidDate ? `${season}.${month}.${day}` : undefined;
}

/**
 * Formats a number with at least two digits, keeping the sign in front as .NET's `00` format does.
 */
function padTwoDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${String(Math.abs(value)).padStart(2, '0')}`;
}
