// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { RequestSlotStore, RequestThrottle } from '../../src/http/request-throttle.js';

/**
 * An in-memory, working slot store standing in for Redis across simulated processes.
 */
class FakeSlotStore implements RequestSlotStore {
  private readonly claims = new Map<string, number>();

  async claimSlot(key: string, ttlMs: number): Promise<number> {
    const expiresAt = this.claims.get(key) ?? 0;
    if (expiresAt > Date.now()) {
      return expiresAt - Date.now();
    }
    this.claims.set(key, Date.now() + ttlMs);
    return 0;
  }
}

describe('RequestThrottle Utility', () => {
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 5; round++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('should space the starts of concurrent callers by the interval', async () => {
    const throttle = new RequestThrottle(40);
    const startTimes: number[] = [];
    for (let caller = 0; caller < 3; caller++) {
      void throttle.acquire().then(() => startTimes.push(Date.now()));
    }

    await settle();
    assert.deepEqual(startTimes, [1_000]);
    mock.timers.tick(39);
    await settle();
    assert.deepEqual(startTimes, [1_000]);
    mock.timers.tick(1);
    await settle();
    assert.deepEqual(startTimes, [1_000, 1_040]);
    mock.timers.tick(40);
    await settle();
    assert.deepEqual(startTimes, [1_000, 1_040, 1_080]);
  });

  it('should reject an already aborted caller without taking a turn', async () => {
    const throttle = new RequestThrottle(1_000);

    await assert.rejects(throttle.acquire(AbortSignal.abort()), { name: 'AbortError' });

    await throttle.acquire();
    assert.equal(Date.now(), 1_000);
  });

  it('should stop waiting when the signal aborts', async () => {
    const throttle = new RequestThrottle(1_000);
    await throttle.acquire();
    const abortController = new AbortController();

    const waiting = throttle.acquire(abortController.signal);
    abortController.abort();

    await assert.rejects(waiting, { name: 'AbortError' });
  });

  it('should give the turns of aborted waiters to the callers behind them', async () => {
    const throttle = new RequestThrottle(60);
    await throttle.acquire();
    const abortController = new AbortController();
    const abandoned = [throttle.acquire(abortController.signal), throttle.acquire(abortController.signal)];
    let nextStartedAt: number | undefined;
    void throttle.acquire().then(() => {
      nextStartedAt = Date.now();
    });

    abortController.abort();
    await Promise.all(abandoned.map(waiter => assert.rejects(waiter, { name: 'AbortError' })));
    mock.timers.tick(60);
    await settle();

    assert.equal(nextStartedAt, 1_060);
  });

  it('should space callers in different processes that share a slot store', async () => {
    const store = new FakeSlotStore();
    const firstProcess = new RequestThrottle(50);
    const secondProcess = new RequestThrottle(50);
    firstProcess.shareSlot(store, 'request-slot:sample');
    secondProcess.shareSlot(store, 'request-slot:sample');

    await firstProcess.acquire();
    let secondStartedAt: number | undefined;
    void secondProcess.acquire().then(() => {
      secondStartedAt = Date.now();
    });

    await settle();
    assert.equal(secondStartedAt, undefined);
    mock.timers.tick(50);
    await settle();
    assert.equal(secondStartedAt, 1_050);
  });

  it('should fall back to local spacing when the slot store cannot be reached', async () => {
    const throttle = new RequestThrottle(50);
    throttle.shareSlot({ claimSlot: async () => undefined }, 'request-slot:sample');

    await throttle.acquire();
    assert.equal(Date.now(), 1_000);
  });
});
