// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BASIC_SEARCH_CAPS,
  canHandleSearch,
  getSupportedSearchParameters,
  hasImdbSearch,
  isSearchModeAvailable,
  mergeSearchCaps,
  parseSearchModes,
  TorznabSearchCaps,
  TorznabSearchModes,
  TorznabSearchRequest,
  TorznabSearchType,
} from '../../../src/jackett/torznab/caps.js';

function createSampleCaps(modes: TorznabSearchModes, supportsTvImdbSearch = false): TorznabSearchCaps {
  return { modes, supportsRawSearch: false, supportsTvImdbSearch };
}

describe('parseSearchModes', () => {
  it('should keep known parameters in Jackett order, matching names case-insensitively', () => {
    assert.deepEqual(
      parseSearchModes({ 'music-search': ['Artist', 'q', 'album'], 'search': ['q'], 'unknown-search': ['q'] }),
      { 'music-search': ['q', 'album', 'artist'], 'search': ['q'] }
    );
    assert.deepEqual(parseSearchModes(undefined), {});
  });
});

describe('mergeSearchCaps', () => {
  it('should unite modes and raw search in Jackett order but drop TV IMDb search', () => {
    assert.deepEqual(
      mergeSearchCaps([
        { modes: { 'movie-search': ['q', 'year'], 'search': ['q'] }, supportsRawSearch: true, supportsTvImdbSearch: true },
        createSampleCaps({ 'movie-search': ['q', 'imdbid'], 'search': ['q'], 'tv-search': ['q', 'season', 'ep'] }),
      ]),
      {
        modes: { 'movie-search': ['q', 'imdbid', 'year'], 'search': ['q'], 'tv-search': ['q', 'season', 'ep'] },
        supportsRawSearch: true,
        supportsTvImdbSearch: false,
      }
    );
  });
});

describe('search mode availability', () => {
  const sampleCaps = createSampleCaps({ 'movie-search': ['q', 'imdbid'], 'tv-search': ['q', 'season', 'ep', 'imdbid'] });

  it('should share basic search caps that cannot be changed', () => {
    assert.ok(Object.isFrozen(BASIC_SEARCH_CAPS));
    assert.ok(Object.isFrozen(BASIC_SEARCH_CAPS.modes));
  });

  it('should always offer basic search and other modes only when they declare parameters', () => {
    assert.equal(isSearchModeAvailable(BASIC_SEARCH_CAPS, 'search'), true);
    assert.equal(isSearchModeAvailable(sampleCaps, 'tv-search'), true);
    assert.equal(isSearchModeAvailable(createSampleCaps({ 'tv-search': [] }, true), 'tv-search'), false);
    assert.equal(isSearchModeAvailable(sampleCaps, 'book-search'), false);
  });

  it('should advertise imdbid for TV search from the TV IMDb flag alone', () => {
    assert.deepEqual(getSupportedSearchParameters(sampleCaps, 'tv-search'), ['q', 'season', 'ep']);
    assert.deepEqual(getSupportedSearchParameters(createSampleCaps({}, true), 'tv-search'), ['q', 'imdbid']);
    assert.deepEqual(getSupportedSearchParameters(sampleCaps, 'movie-search'), ['q', 'imdbid']);
    assert.deepEqual(getSupportedSearchParameters(BASIC_SEARCH_CAPS, 'music-search'), ['q']);
  });
});

describe('canHandleSearch', () => {
  const sampleRequest = (searchType: TorznabSearchType, ids: Partial<TorznabSearchRequest> = {}): TorznabSearchRequest => ({
    hasImdbId: false,
    hasRageId: false,
    hasTvdbId: false,
    searchType,
    ...ids,
  });
  const movieImdbCaps = createSampleCaps({ 'movie-search': ['q', 'imdbid'], 'search': ['q'] });
  const tvCaps = createSampleCaps({ 'search': ['q'], 'tv-search': ['q', 'season', 'ep'] });

  it('should accept a TV search by IMDb id with TV IMDb search, even without a TV search mode', () => {
    assert.equal(canHandleSearch(createSampleCaps({}, true), sampleRequest('tvsearch', { hasImdbId: true })), true);
    assert.equal(canHandleSearch(createSampleCaps({}, true), sampleRequest('tvsearch', { hasImdbId: false })), false);
    assert.equal(hasImdbSearch(createSampleCaps({}, true)), true);
    assert.equal(hasImdbSearch(tvCaps), false);
  });

  it('should require movie IMDb support for a movie search by IMDb id', () => {
    assert.equal(canHandleSearch(movieImdbCaps, sampleRequest('movie', { hasImdbId: true })), true);
    assert.equal(canHandleSearch(tvCaps, sampleRequest('movie', { hasImdbId: true })), false);
  });

  it('should require the search mode to be available otherwise', () => {
    assert.equal(canHandleSearch(tvCaps, sampleRequest('search', { hasImdbId: false })), true);
    assert.equal(canHandleSearch(tvCaps, sampleRequest('tvsearch', { hasImdbId: true })), true);
    assert.equal(canHandleSearch(tvCaps, sampleRequest('movie', { hasImdbId: false })), false);
    assert.equal(canHandleSearch(tvCaps, sampleRequest('music', { hasImdbId: false })), false);
  });

  it('should accept an IMDb search in an unavailable mode when movie IMDb search is supported', () => {
    assert.equal(canHandleSearch(movieImdbCaps, sampleRequest('book', { hasImdbId: true })), true);
    assert.equal(canHandleSearch(movieImdbCaps, sampleRequest('book', { hasImdbId: false })), false);
  });

  it('should accept a TVRage or TVDB id in an unavailable mode when TV search declares it', () => {
    const tvIdCaps = createSampleCaps({ 'search': ['q'], 'tv-search': ['q', 'tvdbid', 'rid'] });
    assert.equal(canHandleSearch(tvIdCaps, sampleRequest('music', { hasTvdbId: true })), true);
    assert.equal(canHandleSearch(tvIdCaps, sampleRequest('book', { hasRageId: true })), true);
    assert.equal(canHandleSearch(tvCaps, sampleRequest('music', { hasTvdbId: true })), false);
    assert.equal(canHandleSearch(tvIdCaps, sampleRequest('music')), false);
  });
});
