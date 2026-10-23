// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { load } from 'cheerio';

import { parseTopicDetails } from '../../../src/providers/cardigann/topic-details.js';

const SAMPLE_MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
const SAMPLE_TRACKERS = ['https://announce.example.test/announce', 'udp://announce.example.test:6969/announce'];
const TOPIC_URL = 'https://tracker.example.test/topic/42';

describe('Cardigann topic metadata extraction', () => {
  it('should read the first matching IMDb and Kinopoisk links', () => {
    const details = parseTopicDetails(load(`
      <h1>Пример Релиза</h1>
      <a href="https://unrelated.example.test/">Unrelated</a>
      <a href="https://www.imdb.com/title/tt0123456/">First IMDb entry</a>
      <a href="https://www.imdb.com/title/tt0654321/">Second IMDb entry</a>
      <a href="https://www.kinopoisk.ru/film/123456/">First Kinopoisk entry</a>
      <a href="https://www.kinopoisk.ru/film/654321/">Second Kinopoisk entry</a>
    `), '42', TOPIC_URL);

    assert.ok(details);
    assert.equal(details.imdbUrl, 'https://www.imdb.com/title/tt0123456/');
    assert.equal(details.imdbId, '0123456');
    assert.equal(details.kinopoiskUrl, 'https://www.kinopoisk.ru/film/123456/');
    assert.equal(details.kinopoiskId, '123456');
  });

  it('should return empty metadata when external title links are missing', () => {
    const details = parseTopicDetails(load('<h1>Sample Release</h1>'), '42', TOPIC_URL);
    assert.ok(details);
    assert.equal(details.imdbUrl, '');
    assert.equal(details.imdbId, undefined);
    assert.equal(details.kinopoiskUrl, '');
    assert.equal(details.kinopoiskId, undefined);
  });

  for (const { expectedTrackers, magnetUri, name, trackers } of [
    { expectedTrackers: [], magnetUri: '', name: 'no magnet when the page has none', trackers: SAMPLE_TRACKERS },
    { expectedTrackers: [], magnetUri: SAMPLE_MAGNET, name: 'a magnet without a configured tracker list', trackers: undefined },
    { expectedTrackers: [], magnetUri: SAMPLE_MAGNET, name: 'a magnet with an empty configured tracker list', trackers: [] },
    { expectedTrackers: SAMPLE_TRACKERS, magnetUri: SAMPLE_MAGNET, name: 'configured trackers in a magnet without existing trackers', trackers: SAMPLE_TRACKERS },
    {
      expectedTrackers: ['https://existing.example.test/announce'],
      magnetUri: SAMPLE_MAGNET + '&tr=https%3A%2F%2Fexisting.example.test%2Fannounce',
      name: 'existing trackers without appending configured trackers',
      trackers: SAMPLE_TRACKERS,
    },
  ]) {
    it(`should extract ${name}`, () => {
      const testHtml = '<h1>Sample Release</h1>' + (magnetUri ? `<a href="${magnetUri.replaceAll('&', '&amp;')}">Magnet</a>` : '');
      const details = parseTopicDetails(load(testHtml), '42', TOPIC_URL, trackers);
      assert.ok(details);
      assert.equal(details.infoHash, magnetUri ? '0123456789ABCDEF0123456789ABCDEF01234567' : '');
      if (magnetUri) {
        assert.equal(new URL(details.magnetUri).searchParams.get('xt'), 'urn:btih:0123456789abcdef0123456789abcdef01234567');
        assert.deepEqual(new URL(details.magnetUri).searchParams.getAll('tr'), expectedTrackers);
      } else {
        assert.equal(details.magnetUri, '');
      }
    });
  }
});
