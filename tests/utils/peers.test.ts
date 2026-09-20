// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePeerCount } from '../../src/utils/peers.js';

describe('Peer Utilities', () => {
  it('should parse standard numeric counts', () => {
    assert.equal(parsePeerCount(42), 42);
    assert.equal(parsePeerCount('150'), 150);
  });

  it('should remove commas and whitespace from formatted counts', () => {
    assert.equal(parsePeerCount('1,234'), 1234);
    assert.equal(parsePeerCount(' 5 678 '), 5678);
  });

  it('should return zero for invalid, null or negative counts', () => {
    assert.equal(parsePeerCount(null), 0);
    assert.equal(parsePeerCount(undefined), 0);
    assert.equal(parsePeerCount('-5'), 0);
    assert.equal(parsePeerCount('invalid'), 0);
  });

  it('should cap placeholder numbers at or above 5,000,000 to zero', () => {
    assert.equal(parsePeerCount(5_000_000), 0);
    assert.equal(parsePeerCount('9999999'), 0);
  });

  it('should treat dots, commas and spaces as digit grouping', () => {
    assert.equal(parsePeerCount('1.234'), 1234);
    assert.equal(parsePeerCount('1 234'), 1234);
    assert.equal(parsePeerCount('1\u00A0234'), 1234);
  });
});
