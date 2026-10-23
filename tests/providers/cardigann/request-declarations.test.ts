// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';

describe('Cardigann upstream request declarations', () => {
  it('should clear mapped categories on a matching negated path', async () => {
    const httpClient = new HttpClient();
    let requestedUrl = '';
    httpClient.getDecoded = async url => { requestedUrl = url; return '<table></table>'; };
    const provider = new CardigannProvider({
      caps: { categorymappings: [{ cat: 'Movies', id: 11 }, { cat: 'TV', id: 22 }] },
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        inputs: { $raw: '{{ range .Categories }}f[]={{ . }}&{{ end }}', q: '{{ .Keywords }}' },
        paths: [{ categories: ['!', '22'], path: 'search' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    await provider.searchByTitle({ categories: [2000], query: 'Example' });
    assert.equal(requestedUrl, 'https://tracker.example/search?q=Example');
    requestedUrl = '';
    await provider.searchByTitle({ categories: [5000], query: 'Example' });
    assert.equal(requestedUrl, '');
  });

  it('should expose the Torznab request type and extended flag, defaulting to search and zero', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => { requestedUrls.push(url); return '<table></table>'; };
    const provider = new CardigannProvider({
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        inputs: { extended: '{{ .Query.Extended }}', q: '{{ .Keywords }}', type: '{{ .Query.Type }}' },
        paths: [{ path: 'search' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    await provider.searchByTitle({ extended: 7, query: 'Test Artist', searchType: 'music' });
    await provider.searchByTitle({ query: 'Example' });
    assert.deepEqual(requestedUrls, [
      'https://tracker.example/search?extended=7&q=Test+Artist&type=music',
      'https://tracker.example/search?extended=0&q=Example&type=search',
    ]);
  });

  it('should expose Jackett limit, offset, requested categories, and empty query placeholders', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => { requestedUrls.push(url); return '<table></table>'; };
    const provider = new CardigannProvider({
      caps: { categories: { 1: 'Movies' } },
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        allowemptyinputs: true,
        fields: { title: { selector: 'a' } },
        inputs: {
          apiKey: '{{ .Query.APIKey }}',
          categories: '{{ join .Query.Categories "," }}',
          flags: '{{ if .Query.Limit }}limit{{ end }}{{ if .Query.Offset }}-offset{{ end }}{{ if .Query.APIKey }}-key{{ end }}',
          limit: '{{ .Query.Limit }}',
          mappedCategories: '{{ join .Categories "," }}',
          movie: '{{ .Query.Movie }}',
          offset: '{{ .Query.Offset }}',
          series: '{{ .Query.Series }}',
        },
        paths: [{ path: 'search' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    await provider.searchByTitle({ query: 'Sample' });
    await provider.searchByTitle({ categories: [2000], limit: 5, offset: 7, query: 'Sample' });
    assert.deepEqual(requestedUrls.map(url => Object.fromEntries(new URL(url).searchParams)), [
      { apiKey: '', categories: '', flags: 'limit-offset', limit: '0', mappedCategories: '', movie: '', offset: '0', series: '' },
      { apiKey: '', categories: '2000', flags: 'limit-offset', limit: '5', mappedCategories: '1', movie: '', offset: '7', series: '' },
    ]);
  });

  it('should expose Torznab ids, music and book values, and request flags as Jackett does', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => { requestedUrls.push(url); return '<table></table>'; };
    const provider = new CardigannProvider({
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        inputs: {
          artist: '{{ .Query.Artist }}',
          author: '{{ .Query.Author }}',
          flags: '{{ if .Query.IsMusicSearch }}music{{ end }}{{ if .Query.IsTvdbQuery }}-tvdb{{ end }}' +
            '{{ if .Query.IsIdSearch }}-id{{ end }}{{ if .Query.IsRssSearch }}-rss{{ end }}',
          tmdb: '{{ .Query.TMDBID }}',
          tvdb: '{{ .Query.TVDBID }}',
        },
        paths: [{ path: 'search' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    await provider.searchByTitle({ artist: 'Test Artist', query: '', searchType: 'music', tvdbId: 7 });
    await provider.searchByTitle({ author: 'Sample Author', query: '', searchType: 'book', tmdbId: -3 });
    await provider.searchByTitle({ query: '' });
    assert.deepEqual(requestedUrls, [
      'https://tracker.example/search?artist=Test+Artist&flags=music-tvdb-id&tvdb=7',
      'https://tracker.example/search?author=Sample+Author&flags=-id&tmdb=-3',
      'https://tracker.example/search?flags=-rss',
    ]);
  });

  it('should leave .Query.Year empty only when no year is requested, so its input is omitted', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => { requestedUrls.push(url); return '<table></table>'; };
    const provider = new CardigannProvider({
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        inputs: { q: '{{ .Keywords }}', year: '{{ .Query.Year }}' },
        paths: [{ path: 'search' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    await provider.searchByTitle({ query: 'Example' });
    await provider.searchByTitle({ query: 'Example', year: 2024 });
    await provider.searchByTitle({ query: 'Example', year: 0 });
    assert.deepEqual(requestedUrls, [
      'https://tracker.example/search?q=Example',
      'https://tracker.example/search?q=Example+2024&year=2024',
      'https://tracker.example/search?q=Example+0&year=0',
    ]);
  });

  for (const allowEmptyInputs of [false, true]) {
    it(`should ${allowEmptyInputs ? 'preserve' : 'omit'} whitespace-only inputs when allowemptyinputs is ${allowEmptyInputs}`, async () => {
      const httpClient = new HttpClient();
      let requestedUrl = '';
      httpClient.getDecoded = async url => { requestedUrl = url; return '<table></table>'; };
      const provider = new CardigannProvider({
        links: ['https://tracker.example/'],
        name: 'Sample Tracker',
        search: {
          allowemptyinputs: allowEmptyInputs,
          fields: { title: { selector: 'a' } },
          inputs: { q: '{{ .Query.Q }}' },
          paths: [{ path: 'search' }],
          rows: { selector: 'tr' },
        },
      }, httpClient);
      await provider.searchByTitle({ query: '  ' });
      assert.equal(new URL(requestedUrl).searchParams.get('q'), allowEmptyInputs ? '  ' : null);
    });
  }

  it('should concatenate the releases of every declared search path, as Jackett does', async () => {
    const httpClient = new HttpClient();
    const requestedPaths: string[] = [];
    httpClient.getDecoded = async url => {
      const path = new URL(url).pathname;
      requestedPaths.push(path);
      const ids = path === '/first' ? [1, 2] : [2, 3];
      return `<table>${ids.map(id => `<tr><td><a href="details.php?id=${id}">Example Release ${id}</a></td></tr>`).join('')}</table>`;
    };
    const provider = new CardigannProvider({
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { details: { attribute: 'href', selector: 'a' }, title: { selector: 'a' } },
        paths: [{ path: 'first' }, { path: 'second' }],
        rows: { selector: 'tr' },
      },
    }, httpClient);

    const items = await provider.searchByTitle({ query: 'Example' });
    assert.deepEqual(requestedPaths, ['/first', '/second']);
    assert.deepEqual(items.map(item => item.id), ['1', '2', '2', '3']);
  });

  for (const method of ['get', 'post'] as const) {
    it(`should send raw repeated category parameters through ${method.toUpperCase()}`, async () => {
      const httpClient = new HttpClient();
      let params = new URLSearchParams();
      httpClient.getDecoded = async url => {
        params = new URL(url).searchParams;
        return '<table></table>';
      };
      httpClient.postForm = async (_url, form) => {
        assert.ok(form instanceof URLSearchParams);
        params = form;
        return { content: '<table></table>', cookies: [], headers: {}, status: 200 };
      };
      const provider = new CardigannProvider({
        caps: { categorymappings: [{ cat: 'Movies', id: 11 }, { cat: 'Movies', id: 22 }] },
        links: ['https://tracker.example/'],
        name: 'Sample Tracker',
        search: {
          fields: { title: { selector: 'a' } },
          inputs: { $raw: '{{ range .Categories }}f[]={{ . }}&{{ end }}q={{ .Keywords }}' },
          paths: [{ method, path: 'search' }],
          rows: { selector: 'tr' },
        },
      }, httpClient);

      await provider.searchByTitle({ categories: [2000], query: 'Sample & Пример' });
      assert.deepEqual([...params], [['f[]', '11'], ['f[]', '22'], ['q', 'Sample & Пример']]);
    });
  }
});
