// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import iconv from 'iconv-lite';

import { isTorrentFile, parseTorrentMetainfo } from '../../src/utils/bencode.js';

const TEST_PIECES = '6:pieces20:AAAAAAAAAAAAAAAAAAAA';
const TEST_INFO = `d6:lengthi5e4:name15:Example Release12:piece lengthi16384e${TEST_PIECES}e`;

/**
 * Encodes a byte string the way bencode does: its byte length, a colon, then the bytes.
 */
function bencodeBytes(value: Buffer | string): Buffer {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
}

function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex').toUpperCase();
}

describe('Bencode Utilities', () => {
  describe('isTorrentFile', () => {
    it('should accept a bencoded dictionary with an info key', () => {
      assert.equal(isTorrentFile(Buffer.from(`d4:info${TEST_INFO}e`)), true);
    });

    it('should reject an HTML error page', () => {
      assert.equal(isTorrentFile(Buffer.from('<!doctype html><html><body>Login required</body></html>')), false);
    });
  });

  describe('parseTorrentMetainfo', () => {
    it('should hash the raw info dictionary and read the name and announce URL', () => {
      const testTorrent = Buffer.from(`d8:announce31:http://retracker.local/announce4:info${TEST_INFO}e`);
      const metainfo = parseTorrentMetainfo(testTorrent);

      assert.deepEqual(metainfo, {
        infoHash: 'FEE52EFEE94D37966452F02FFD4148E5308811E0',
        name: 'Example Release',
        trackers: ['http://retracker.local/announce'],
      });
    });

    it('should hash info bytes as written even when keys are not in canonical order', () => {
      const sampleInfo = `d4:name15:Example Release6:lengthi5e12:piece lengthi16384e${TEST_PIECES}e`;
      const metainfo = parseTorrentMetainfo(Buffer.from(`d4:info${sampleInfo}e`));

      assert.equal(metainfo?.infoHash, sha1Hex(sampleInfo));
      assert.notEqual(metainfo?.infoHash, sha1Hex(TEST_INFO));
    });

    it('should hash the info dictionary when it is not the last top-level key', () => {
      const testTorrent = Buffer.from(`d4:info${TEST_INFO}8:url-listl26:http://mirror.example.org/ee`);
      assert.equal(parseTorrentMetainfo(testTorrent)?.infoHash, sha1Hex(TEST_INFO));
    });

    it('should list announce-list tiers after announce without duplicates', () => {
      const testTorrent = Buffer.from(
        'd8:announce31:http://retracker.local/announce' +
          '13:announce-listl' +
          'l31:http://retracker.local/announce35:http://tracker.example.org/announcee' +
          'l39:udp://tracker.example.com:6969/announcee' +
          'e' +
          `4:info${TEST_INFO}e`
      );

      assert.deepEqual(parseTorrentMetainfo(testTorrent)?.trackers, [
        'http://retracker.local/announce',
        'http://tracker.example.org/announce',
        'udp://tracker.example.com:6969/announce',
      ]);
    });

    it('should return an empty tracker list for a trackerless torrent', () => {
      assert.deepEqual(parseTorrentMetainfo(Buffer.from(`d4:info${TEST_INFO}e`))?.trackers, []);
    });

    it('should prefer name.utf-8 over name', () => {
      const testTorrent = Buffer.concat([
        Buffer.from('d4:infod6:lengthi5e4:name'),
        bencodeBytes(iconv.encode('Тестовый Релиз', 'win1251')),
        Buffer.from('10:name.utf-8'),
        bencodeBytes('Пример Фильма'),
        Buffer.from(`12:piece lengthi16384e${TEST_PIECES}ee`),
      ]);

      assert.equal(parseTorrentMetainfo(testTorrent)?.name, 'Пример Фильма');
    });

    it('should decode a non-UTF-8 name with the declared encoding', () => {
      const testTorrent = Buffer.concat([
        Buffer.from('d8:encoding12:windows-12514:infod6:lengthi5e4:name'),
        bencodeBytes(iconv.encode('Тестовый Релиз', 'win1251')),
        Buffer.from(`12:piece lengthi16384e${TEST_PIECES}ee`),
      ]);

      assert.equal(parseTorrentMetainfo(testTorrent)?.name, 'Тестовый Релиз');
    });

    it('should omit a name that is not valid UTF-8 and has no declared encoding', () => {
      const testTorrent = Buffer.concat([
        Buffer.from('d4:infod6:lengthi5e4:name'),
        bencodeBytes(iconv.encode('Тестовый Релиз', 'win1251')),
        Buffer.from(`12:piece lengthi16384e${TEST_PIECES}ee`),
      ]);
      const metainfo = parseTorrentMetainfo(testTorrent);

      assert.ok(metainfo);
      assert.equal(metainfo.name, undefined);
    });

    it('should omit a name whose bytes are not valid UTF-8 despite a declared UTF-8 encoding', () => {
      const testTorrent = Buffer.concat([
        Buffer.from('d8:encoding5:UTF-84:infod6:lengthi5e4:name'),
        bencodeBytes(iconv.encode('Тестовый Релиз', 'win1251')),
        Buffer.from(`12:piece lengthi16384e${TEST_PIECES}ee`),
      ]);
      const metainfo = parseTorrentMetainfo(testTorrent);

      assert.ok(metainfo);
      assert.equal(metainfo.name, undefined);
    });

    it('should return null for a v2-only torrent without v1 pieces', () => {
      const testTorrent = Buffer.from('d4:infod12:meta versioni2e4:name15:Example Release12:piece lengthi16384eee');
      assert.equal(parseTorrentMetainfo(testTorrent), null);
    });

    it('should return null for malformed input without throwing', () => {
      const malformedSamples = [
        '',
        '<!doctype html><html></html>',
        `d4:info${TEST_INFO}`,
        'd8:announce99:http://retracker.local/announcee',
        'd4:infoi12x3ee',
        'd8:announce31:http://retracker.local/announcee',
        `d4:info${'l'.repeat(1000)}${'e'.repeat(1000)}e`,
      ];

      for (const sample of malformedSamples) {
        assert.equal(parseTorrentMetainfo(Buffer.from(sample)), null, sample.slice(0, 40));
      }
    });
  });
});
