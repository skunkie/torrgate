// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConcurrencyLimiter } from '../../src/http/concurrency-limiter.js';

describe('ConcurrencyLimiter Utility', () => {
  it('should reject limits that cannot schedule tasks safely', () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => new ConcurrencyLimiter(limit), /positive safe integer/);
    }
  });

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

  it('should serve queued callers before new arrivals when a slot is released', async () => {
    const limiter = new ConcurrencyLimiter(1);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = limiter.execute(() => gate);
    const startOrder: string[] = [];
    let activeTasks = 0;
    let maxObservedActive = 0;
    const runTask = async (name: string): Promise<void> => {
      activeTasks++;
      maxObservedActive = Math.max(maxObservedActive, activeTasks);
      startOrder.push(name);
      await new Promise(resolve => setImmediate(resolve));
      activeTasks--;
    };
    const second = limiter.execute(() => runTask('queued'));
    release();
    const third = new Promise<void>((resolve, reject) => {
      queueMicrotask(() => { limiter.execute(() => runTask('new')).then(resolve, reject); });
    });

    await Promise.all([first, second, third]);

    assert.deepEqual(startOrder, ['queued', 'new']);
    assert.equal(maxObservedActive, 1);
  });
});
