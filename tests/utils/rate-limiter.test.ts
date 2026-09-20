// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FailedAttemptLimiter } from '../../src/utils/rate-limiter.js';

describe('FailedAttemptLimiter', () => {
  it('should block a client once it reaches the failed attempt limit within the window', () => {
    const limiter = new FailedAttemptLimiter({ maxAttempts: 3, windowMs: 1000 });
    for (let i = 0; i < 2; i++) {
      limiter.recordFailure('198.51.100.7', 0);
    }
    assert.equal(limiter.isBlocked('198.51.100.7', 10), false);

    limiter.recordFailure('198.51.100.7', 20);
    assert.equal(limiter.isBlocked('198.51.100.7', 30), true);
    assert.equal(limiter.isBlocked('203.0.113.9', 30), false);
  });

  it('should unblock a client after its window expires', () => {
    const limiter = new FailedAttemptLimiter({ maxAttempts: 1, windowMs: 1000 });
    limiter.recordFailure('198.51.100.7', 0);
    assert.equal(limiter.isBlocked('198.51.100.7', 999), true);
    assert.equal(limiter.isBlocked('198.51.100.7', 1000), false);
  });

  it('should clear a client on reset', () => {
    const limiter = new FailedAttemptLimiter({ maxAttempts: 1 });
    limiter.recordFailure('198.51.100.7');
    limiter.reset('198.51.100.7');
    assert.equal(limiter.isBlocked('198.51.100.7'), false);
  });

  it('should keep the number of tracked clients bounded', () => {
    const limiter = new FailedAttemptLimiter({ maxTrackedClients: 3, windowMs: 1000 });
    for (let i = 0; i < 10; i++) {
      limiter.recordFailure(`client-${i}`, 0);
    }
    assert.equal(limiter.size, 3);
  });

  it('should prune expired windows before evicting active clients', () => {
    const limiter = new FailedAttemptLimiter({ maxAttempts: 1, maxTrackedClients: 2, windowMs: 1000 });
    limiter.recordFailure('expired-client', 0);
    limiter.recordFailure('active-client', 1500);
    limiter.recordFailure('new-client', 1600);
    assert.equal(limiter.size, 2);
    assert.equal(limiter.isBlocked('active-client', 1700), true);
  });
});
