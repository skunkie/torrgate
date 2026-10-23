// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findMatchingMirror } from '../../src/utils/mirror.js';

describe('Mirror URL matching', () => {
  const mirrors = ['https://tracker.example/', 'https://alternate.example:8443/'];

  it('should match configured schemes and normalized ports for hosts and subdomains', () => {
    for (const url of ['https://tracker.example/download', 'https://tracker.example:443/download', 'https://files.tracker.example/download']) {
      assert.equal(findMatchingMirror(url, mirrors), mirrors[0]);
    }
    assert.equal(findMatchingMirror('https://alternate.example:8443/download', mirrors), mirrors[1]);
  });

  it('should reject different schemes, ports, unrelated hosts and invalid URLs', () => {
    for (const url of [
      'http://tracker.example/download',
      'https://tracker.example:8443/download',
      'https://alternate.example/download',
      'https://tracker.example.external.example/download',
      'ftp://tracker.example/download',
      'invalid-url',
    ]) {
      assert.equal(findMatchingMirror(url, mirrors), undefined);
    }
    assert.equal(findMatchingMirror('https://tracker.example/download', ['invalid-url']), undefined);
  });

  it('should allow HTTP only for explicitly configured HTTP mirrors', () => {
    assert.equal(findMatchingMirror('http://tracker.example:80/download', ['http://tracker.example/']), 'http://tracker.example/');
  });
});
