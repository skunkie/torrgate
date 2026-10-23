// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildMagnetUri, extractInfoHash, getMagnetInfoHash } from '../../src/utils/magnet.js';

describe('Magnet Utilities', () => {
  it('should construct a bare magnet URI when no provider is specified', () => {
    const sampleHash = '0123456789abcdef0123456789abcdef01234567';
    const uri = buildMagnetUri(sampleHash);
    assert.equal(uri, `magnet:?xt=urn:btih:${sampleHash}`);
  });

  it('should append custom announce trackers', () => {
    const sampleHash = '0123456789abcdef0123456789abcdef01234567';
    const sampleTrackers = [
      'http://tracker.example.org/announce',
      'udp://tracker.example.com:6969/announce',
    ];
    const uri = buildMagnetUri(sampleHash, sampleTrackers);
    assert.match(uri, /^magnet:\?xt=urn:btih:0123456789abcdef0123456789abcdef01234567/);
    assert.match(uri, /&tr=http%3A%2F%2Ftracker\.example\.org%2Fannounce/);
    assert.match(uri, /&tr=udp%3A%2F%2Ftracker\.example\.com%3A6969%2Fannounce/);
  });

  it('should add an encoded display name before the trackers', () => {
    const sampleHash = '0123456789abcdef0123456789abcdef01234567';
    const uri = buildMagnetUri(sampleHash, ['http://tracker.example.org/announce'], 'Тестовый Релиз [2026]');
    assert.equal(
      uri,
      `magnet:?xt=urn:btih:${sampleHash}&dn=${encodeURIComponent('Тестовый Релиз [2026]')}&tr=http%3A%2F%2Ftracker.example.org%2Fannounce`
    );
  });

  it('should clean existing magnet prefix and query params from hash', () => {
    const sampleFullUri = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Example';
    const uri = buildMagnetUri(sampleFullUri);
    assert.equal(uri, 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12');
  });

  describe('extractInfoHash', () => {
    it('should extract info hash from full magnet URI', () => {
      const sampleUri = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Sample';
      assert.equal(extractInfoHash(sampleUri), '0123456789ABCDEF0123456789ABCDEF01234567');
    });

    it('should normalize bare info hash string', () => {
      const sampleBare = '0123456789abcdef0123456789abcdef01234567';
      assert.equal(extractInfoHash(sampleBare), '0123456789ABCDEF0123456789ABCDEF01234567');
    });

    it('should normalize base32 info hashes from bare strings and magnet URIs', () => {
      const sampleHash = 'abcdefghijklmnopqrstuvwxyz234567';
      assert.equal(extractInfoHash(sampleHash), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
      assert.equal(extractInfoHash(`magnet:?xt=urn:btih:${sampleHash}`), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
    });

    it('should return null for invalid or empty magnet URIs', () => {
      assert.equal(extractInfoHash(''), null);
      assert.equal(extractInfoHash('magnet:?dn=NoHash'), null);
      assert.equal(extractInfoHash(undefined), null);
    });
  });
});

describe('getMagnetInfoHash', () => {
  it('should read the first exact topic after its last colon, as written', () => {
    assert.equal(getMagnetInfoHash('magnet:?dn=Sample&xt=urn:btih:abcDEF0123456789abcdef0123456789abcdef01&xt=urn:btih:other'), 'abcDEF0123456789abcdef0123456789abcdef01');
    assert.equal(getMagnetInfoHash('magnet:?dn=Sample'), undefined);
    assert.equal(getMagnetInfoHash(undefined), undefined);
    assert.equal(getMagnetInfoHash('magnet:?dn=Sample?Draft&XT=urn:btih:sampleHash#fragment'), 'sampleHash');
    assert.equal(getMagnetInfoHash('magnet:?xt=urn:btih:sample%3FHash%23encoded#fragment'), 'sample?Hash#encoded');
    assert.equal(getMagnetInfoHash('magnet:?xt='), '');
    assert.equal(getMagnetInfoHash('magnet:no-query'), undefined);
  });
});
