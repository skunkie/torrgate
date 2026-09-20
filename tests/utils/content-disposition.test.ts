// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import iconv from 'iconv-lite';

import {
  buildAttachmentHeader,
  DEFAULT_TORRENT_FILE_NAME,
  parseContentDispositionFileName,
  sanitizeTorrentFileName,
} from '../../src/utils/content-disposition.js';

describe('Content-Disposition file names', () => {
  it('should prefer the RFC 5987 filename* parameter', () => {
    const header = `attachment; filename="fallback.torrent"; filename*=UTF-8''${encodeURIComponent('Пример Фильма.torrent')}`;
    assert.equal(parseContentDispositionFileName(header), 'Пример Фильма.torrent');
  });

  it('should decode filename* declared in windows-1251', () => {
    const encoded = [...iconv.encode('Тест.torrent', 'win1251')].map(b => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
    assert.equal(parseContentDispositionFileName(`attachment; filename*=windows-1251''${encoded}`), 'Тест.torrent');
  });

  it('should decode a raw windows-1251 filename header as Node presents it', () => {
    const rawHeader = `attachment; filename="${iconv.encode('Тестовый Релиз.torrent', 'win1251').toString('latin1')}"`;
    assert.equal(parseContentDispositionFileName(rawHeader), 'Тестовый Релиз.torrent');
  });

  it('should return undefined without a file name', () => {
    assert.equal(parseContentDispositionFileName(undefined), undefined);
    assert.equal(parseContentDispositionFileName('attachment'), undefined);
  });

  it('should reduce names to a safe base name ending in .torrent', () => {
    assert.equal(sanitizeTorrentFileName('../../etc/Example Release'), 'Example Release.torrent');
    assert.equal(sanitizeTorrentFileName('Sample "Show"\u0001.torrent'), 'Sample Show.torrent');
    assert.equal(sanitizeTorrentFileName(''), DEFAULT_TORRENT_FILE_NAME);
    assert.equal(sanitizeTorrentFileName('..'), DEFAULT_TORRENT_FILE_NAME);
  });

  it('should build a header with an ASCII fallback and the UTF-8 name', () => {
    assert.equal(
      buildAttachmentHeader('Тест.torrent'),
      `attachment; filename="____.torrent"; filename*=UTF-8''${encodeURIComponent('Тест.torrent')}`
    );
  });

  it('should escape characters RFC 5987 does not allow raw in filename*', () => {
    const header = buildAttachmentHeader("Sample's Show (2026).torrent");
    assert.ok(header.endsWith("filename*=UTF-8''Sample%27s%20Show%20%282026%29.torrent"));
    assert.equal(parseContentDispositionFileName(header), "Sample's Show (2026).torrent");
  });
});
