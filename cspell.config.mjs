// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { spellingParsers } from './spelling-parser.mjs';

export default {
  dictionaries: ['css', 'html', 'html-symbol-entities', 'typescript'],
  files: ['openapi.yaml', '*.md', 'docs/**/*.md', 'api/**/*.ts', 'src/**/*.ts', 'tests/**/*.ts', '*.mjs'],
  ignoreRegExpList: ['/\\p{Script=Cyrillic}+/gu'],
  language: 'en-US',
  overrides: [
    { filename: '**/*.{ts,js,mjs}', parser: 'torrgate-source' },
    { filename: '**/*.md', parser: 'torrgate-markdown' },
    { filename: '**/openapi.yaml', parser: 'torrgate-openapi' },
  ],
  plugins: [{ parsers: spellingParsers }],
  useGitignore: true,
  version: '0.2',
  words: [
    'allowtvsearchimdb', 'apikey', 'backticked', 'bencode', 'bencoded', 'btih', 'buildability', 'Cardigann', 'Douban',
    'imdbid', 'infohash', 'Jackett', 'Kinopoisk', 'Kinozal', 'leecher', 'leechers', 'longhands',
    'metainfo', 'mojibake', 'Newznab', 'nonblank', 'nonspacing', 'Prowlarr', 'Radarr',
    'rasterizes', 'Redocly', 'RuTor', 'Sonarr', 'subresource', 'TMDB', 'TorrGate',
    'tmdbid', 'Torznab', 'TVDB', 'tvdbid', 'tvmazeid', 'tvsearch', 'unconfigured', 'unexports', 'ungreedy', 'unparseable',
  ],
};
