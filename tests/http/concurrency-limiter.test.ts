// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConcurrencyLimiter } from '../../src/http/concurrency-limiter.js';

describe('ConcurrencyLimiter Utility', () => {
  it('should restrict concurrency to the configured limit', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let activeTasks = 0;
    let maxObservedActive = 0;

    const sampleTask = async (): Promise<string> => {
      return limiter.execute(async () => {
        activeTasks++;
        maxObservedActive = Math.max(maxObservedActive, activeTasks);
        await new Promise(resolve => setTimeout(resolve, 20));
        activeTasks--;
        return 'sample result';
      });
    };

    const results = await Promise.all([
      sampleTask(),
      sampleTask(),
      sampleTask(),
      sampleTask(),
    ]);

    assert.equal(results.length, 4);
    assert.ok(maxObservedActive <= 2, `Observed ${maxObservedActive} active tasks, expected <= 2`);
  });

  it('should release concurrency slot even when task throws', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await assert.rejects(async () => {
      await limiter.execute(async () => {
        throw new Error('Task failure');
      });
    });

    const nextResult = await limiter.execute(async () => 'recovered');
    assert.equal(nextResult, 'recovered');
  });
});
