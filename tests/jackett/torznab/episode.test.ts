// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatEpisodeSearchString, parseEpisodeSearchQuery } from '../../../src/jackett/torznab/episode.js';

describe('formatEpisodeSearchString', () => {
  it('should build season and episode tags', () => {
    assert.equal(formatEpisodeSearchString(1, undefined), 'S01');
    assert.equal(formatEpisodeSearchString(1, ' '), 'S01');
    assert.equal(formatEpisodeSearchString(1, '2'), 'S01E02');
    assert.equal(formatEpisodeSearchString(12, '345'), 'S12E345');
    assert.equal(formatEpisodeSearchString(100, '5'), 'S100E05');
  });

  it('should return no tag without a season or for season 0', () => {
    assert.equal(formatEpisodeSearchString(undefined, '2'), '');
    assert.equal(formatEpisodeSearchString(0, '2'), '');
  });

  it('should keep the sign of negative seasons in front of the padding', () => {
    assert.equal(formatEpisodeSearchString(-1, '2'), 'S-01E02');
  });

  it('should format daily-show air dates', () => {
    assert.equal(formatEpisodeSearchString(2024, '10/21'), '2024.10.21');
    assert.equal(formatEpisodeSearchString(2024, '02/29'), '2024.02.29');
  });

  it('should read invalid air dates as episode numbers', () => {
    assert.equal(formatEpisodeSearchString(2023, '02/29'), 'S2023E229');
    assert.equal(formatEpisodeSearchString(24, '10/21'), 'S24E1021');
    assert.equal(formatEpisodeSearchString(2024, '1/21'), 'S2024E121');
  });

  it('should read episode numbers from the digits of the episode value', () => {
    assert.equal(formatEpisodeSearchString(1, '01A'), 'S01E01');
    assert.equal(formatEpisodeSearchString(1, '-3'), 'S01E03');
    assert.equal(formatEpisodeSearchString(1, 'abc'), 'S01E00');
  });

  it('should keep episode values that cannot be read as numbers', () => {
    assert.equal(formatEpisodeSearchString(1, '.'), 'S01E.');
    assert.equal(formatEpisodeSearchString(1, '99999999999'), 'S01E99999999999');
  });
});

describe('parseEpisodeSearchQuery', () => {
  it('should split a trailing SxxEyy tag and trim leading zeros from the episode', () => {
    assert.deepEqual(parseEpisodeSearchQuery(' Sample Show S01E02 '), { episode: '2', query: 'Sample Show', season: 1 });
    assert.deepEqual(parseEpisodeSearchQuery('Sample Show S2024E0010b'), { episode: '10b', query: 'Sample Show', season: 2024 });
    assert.deepEqual(parseEpisodeSearchQuery('S00E00'), { episode: '', query: '', season: 0 });
  });

  it('should split a trailing Eyy tag and then a trailing Sxx tag', () => {
    assert.deepEqual(parseEpisodeSearchQuery('Sample Show E05'), { episode: '5', query: 'Sample Show', season: undefined });
    assert.deepEqual(parseEpisodeSearchQuery('Sample Show S03'), { episode: undefined, query: 'Sample Show', season: 3 });
    assert.deepEqual(parseEpisodeSearchQuery('Sample Show S03 E05'), { episode: '5', query: 'Sample Show', season: 3 });
  });

  it('should keep tags that are not trailing, not whole words, or not in Jackett form', () => {
    for (const query of ['Sample S01E02 Show', 'SampleS01E02', 'ПримерS01E02', 'Sample Show s01e02', 'Sample Show S1E2', 'Sample Show S01E02AB']) {
      assert.deepEqual(parseEpisodeSearchQuery(query), { episode: undefined, query, season: undefined });
    }
    assert.deepEqual(parseEpisodeSearchQuery('   '), { query: '' });
  });

  it('should treat only nonspacing marks among combining marks as word characters, as .NET does', () => {
    assert.deepEqual(parseEpisodeSearchQuery('Sample\u0301S01E02'), {
      episode: undefined,
      query: 'Sample\u0301S01E02',
      season: undefined,
    });
    assert.deepEqual(parseEpisodeSearchQuery('Sample\u0903S01E02'), { episode: '2', query: 'Sample\u0903', season: 1 });
  });
});
