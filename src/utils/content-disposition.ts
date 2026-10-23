// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import iconv from 'iconv-lite';

/**
 * File name used when the tracker does not supply a usable one.
 */
export const DEFAULT_TORRENT_FILE_NAME = 'release.torrent';

/**
 * Extracts the file name from a Content-Disposition header, preferring the RFC 5987
 * `filename*` form. A plain `filename` whose bytes are not valid UTF-8 is decoded as
 * windows-1251, which trackers in this project use for legacy headers.
 */
export function parseContentDispositionFileName(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return undefined;
  }

  const extended = value.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (extended) {
    const charset = extended[1].trim().toLowerCase() || 'utf-8';
    if (iconv.encodingExists(charset)) {
      return iconv.decode(percentDecode(extended[2].trim()), charset);
    }
  }

  const plain = value.match(/filename\s*=\s*(?:"([^"]*)"|([^;]+))/i);
  const raw = (plain?.[1] ?? plain?.[2])?.trim();
  if (!raw) {
    return undefined;
  }

  const bytes = Buffer.from(raw, 'latin1');
  const asUtf8 = bytes.toString('utf8');
  return asUtf8.includes('\uFFFD') ? iconv.decode(bytes, 'win1251') : asUtf8;
}

function percentDecode(encoded: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const hex = encoded.slice(i + 1, i + 3);
    if (encoded[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(encoded[i], 'utf8'));
    }
  }
  return Buffer.from(bytes);
}

/**
 * Reduces a file name to a safe base name ending in `.torrent`: no directories,
 * control characters or quotes. Returns the default name when nothing usable remains.
 */
export function sanitizeTorrentFileName(fileName: string | undefined): string {
  const baseName = (fileName ?? '').split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = baseName.replace(/[\u0000-\u001F\u007F"]/g, '').trim();
  if (!cleaned || cleaned === '.torrent' || /^\.+$/.test(cleaned)) {
    return DEFAULT_TORRENT_FILE_NAME;
  }
  return cleaned.toLowerCase().endsWith('.torrent') ? cleaned : `${cleaned}.torrent`;
}

/**
 * Builds an `attachment` Content-Disposition header with an ASCII fallback name and the
 * full UTF-8 name in `filename*`.
 */
export function buildAttachmentHeader(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/[\\"]/g, '_');
  const extendedValue = encodeURIComponent(fileName).replace(
    /['()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${extendedValue}`;
}
