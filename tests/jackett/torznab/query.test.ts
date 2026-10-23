// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BASIC_SEARCH_CAPS } from '../../../src/jackett/torznab/caps.js';
import { bindTorznabQuery, bindTorznabSearch, TorznabQueryError } from '../../../src/jackett/torznab/query.js';

describe('Torznab query binding', () => {
  it('should bind TMDb IDs and require the requested search capabilities', () => {
    const query = bindTorznabQuery('/?t=movie&tmdbid=42');
    const caps = { ...BASIC_SEARCH_CAPS, modes: { 'movie-search': ['q', 'tmdbid'] } };
    assert.equal(query.searchIds.tmdbId, 42);
    assert.equal(bindTorznabSearch(query, caps, 'sample').searchType, 'movie');
    assert.throws(() => bindTorznabSearch(query, BASIC_SEARCH_CAPS, 'sample'), { code: 201 });
    assert.throws(() => bindTorznabSearch(query, { ...caps, modes: { 'movie-search': ['q'] } }, 'sample'), { code: 203 });
  });

  it('should reject TMDb searches in an unavailable search mode', () => {
    const query = bindTorznabQuery('/?t=music&tmdbid=42');
    const caps = { ...BASIC_SEARCH_CAPS, modes: { 'tv-search': ['q', 'rid', 'tvdbid'] } };
    assert.throws(() => bindTorznabSearch(query, caps, 'sample'), { code: 201 });
  });

  it('should validate numeric parameters in Jackett order even for discovery', () => {
    for (const [query, message] of [
      ['t=caps&season=invalid&rid=invalid', 'season must be an integer'],
      ['t=indexers&rid=invalid&year=invalid', 'rid must be an integer'],
      ['year=invalid&cat=invalid', 'year must be an integer'],
      ['cat=invalid&limit=2147483648', 'cat must be a comma-separated list of integers'],
    ]) {
      assert.throws(() => bindTorznabQuery('https://gateway.example.test/?' + query), { code: 201, message, name: 'TorznabQueryError' });
    }
  });

  it('should check search capabilities before normalizing an IMDb value', () => {
    const query = bindTorznabQuery('/?t=movie&imdbid=invalid');
    assert.throws(() => bindTorznabSearch(query, BASIC_SEARCH_CAPS, 'sample'), error => {
      assert.ok(error instanceof TorznabQueryError);
      assert.equal(error.code, 201);
      assert.match(error.message, /does not support the requested query/);
      return true;
    });
    const caps = { ...BASIC_SEARCH_CAPS, modes: { 'movie-search': ['imdbid'] } };
    assert.throws(() => bindTorznabSearch(query, caps, 'sample'), /imdbid must be an IMDb title id/);
  });
});
