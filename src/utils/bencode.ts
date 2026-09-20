// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';

import iconv from 'iconv-lite';

import { TorrentMetainfo } from '../types/torrent.js';

/**
 * A decoded bencode value. Byte strings stay as buffers because a .torrent mixes text
 * (names, announce URLs) with binary data (piece hashes).
 */
type BencodeValue = Buffer | number | BencodeValue[] | Map<string, BencodeValue>;

interface DecodedValue<T extends BencodeValue = BencodeValue> {
  end: number;
  value: T;
}

const MAX_BENCODE_DEPTH = 64;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

/**
 * Returns whether a buffer looks like a bencoded .torrent file: a dictionary (`d`) that
 * contains an `info` or `announce` key. Trackers answer failed downloads with HTML
 * login or error pages, which this rejects.
 */
export function isTorrentFile(buffer: Buffer): boolean {
  return (
    buffer.length > 20 &&
    buffer[0] === 0x64 &&
    (buffer.includes(Buffer.from('4:info')) || buffer.includes(Buffer.from('8:announce')))
  );
}

/**
 * Reads the info hash, display name, and announce URLs from a .torrent metainfo file.
 * The info hash is the SHA-1 of the `info` dictionary exactly as it appears in the file,
 * so it matches what clients compute even when the file is not canonically encoded.
 * Returns null for malformed input and for v2-only torrents, which have no v1 info hash.
 */
export function parseTorrentMetainfo(buffer: Buffer): TorrentMetainfo | null {
  try {
    if (buffer[0] !== 0x64) {
      return null;
    }

    const entries = new Map<string, BencodeValue>();
    let infoBytes: Buffer | undefined;
    let position = 1;
    while (buffer[position] !== 0x65) {
      if (position >= buffer.length) {
        return null;
      }
      const key = decodeString(buffer, position);
      const entry = decodeValue(buffer, key.end, 1);
      const keyName = key.value.toString('latin1');
      if (keyName === 'info') {
        infoBytes = buffer.subarray(key.end, entry.end);
      }
      entries.set(keyName, entry.value);
      position = entry.end;
    }

    const info = entries.get('info');
    if (!infoBytes || !(info instanceof Map) || !info.has('pieces')) {
      return null;
    }

    const fallbackEncoding = decodeText(entries.get('encoding'));
    const name = decodeText(info.get('name.utf-8')) ?? decodeText(info.get('name'), fallbackEncoding);

    return {
      infoHash: createHash('sha1').update(infoBytes).digest('hex').toUpperCase(),
      name: name || undefined,
      trackers: collectTrackers(entries),
    };
  } catch {
    return null;
  }
}

/**
 * Lists the announce URLs of a metainfo file, `announce` first, then every tier of
 * `announce-list`, without duplicates.
 */
function collectTrackers(entries: Map<string, BencodeValue>): string[] {
  const trackers: string[] = [];
  const addTracker = (value: BencodeValue | undefined): void => {
    const url = decodeText(value)?.trim();
    if (url && !trackers.includes(url)) {
      trackers.push(url);
    }
  };

  addTracker(entries.get('announce'));
  const announceList = entries.get('announce-list');
  if (Array.isArray(announceList)) {
    for (const tier of announceList) {
      if (Array.isArray(tier)) {
        tier.forEach(addTracker);
      }
    }
  }
  return trackers;
}

/**
 * Decodes a bencode byte string as UTF-8, or with the file's declared `encoding` when the
 * bytes are not valid UTF-8. Returns undefined rather than a mis-decoded string.
 */
function decodeText(value: BencodeValue | undefined, fallbackEncoding?: string): string | undefined {
  if (!Buffer.isBuffer(value)) {
    return undefined;
  }
  try {
    return UTF8_DECODER.decode(value);
  } catch {
    if (fallbackEncoding && !/^utf-?8$/i.test(fallbackEncoding) && iconv.encodingExists(fallbackEncoding)) {
      return iconv.decode(value, fallbackEncoding);
    }
    return undefined;
  }
}

function decodeValue(buffer: Buffer, offset: number, depth: number): DecodedValue {
  if (depth > MAX_BENCODE_DEPTH) {
    throw new Error('Bencode nesting is too deep');
  }

  const marker = buffer[offset];
  if (marker === 0x69) {
    const end = buffer.indexOf(0x65, offset + 1);
    const digits = end === -1 ? '' : buffer.toString('latin1', offset + 1, end);
    if (!/^-?\d+$/.test(digits)) {
      throw new Error('Invalid bencode integer');
    }
    return { end: end + 1, value: Number(digits) };
  }

  if (marker === 0x6c) {
    const items: BencodeValue[] = [];
    let position = offset + 1;
    while (buffer[position] !== 0x65) {
      if (position >= buffer.length) {
        throw new Error('Unterminated bencode list');
      }
      const item = decodeValue(buffer, position, depth + 1);
      items.push(item.value);
      position = item.end;
    }
    return { end: position + 1, value: items };
  }

  if (marker === 0x64) {
    const entries = new Map<string, BencodeValue>();
    let position = offset + 1;
    while (buffer[position] !== 0x65) {
      if (position >= buffer.length) {
        throw new Error('Unterminated bencode dictionary');
      }
      const key = decodeString(buffer, position);
      const entry = decodeValue(buffer, key.end, depth + 1);
      entries.set(key.value.toString('latin1'), entry.value);
      position = entry.end;
    }
    return { end: position + 1, value: entries };
  }

  return decodeString(buffer, offset);
}

function decodeString(buffer: Buffer, offset: number): DecodedValue<Buffer> {
  const colon = buffer.indexOf(0x3a, offset);
  const digits = colon === -1 ? '' : buffer.toString('latin1', offset, colon);
  if (!/^\d+$/.test(digits)) {
    throw new Error('Invalid bencode string length');
  }
  const start = colon + 1;
  const end = start + Number(digits);
  if (end > buffer.length) {
    throw new Error('Bencode string exceeds buffer');
  }
  return { end, value: buffer.subarray(start, end) };
}
