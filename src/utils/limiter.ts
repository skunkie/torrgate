// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Concurrency limiter coordinating in-flight asynchronous operations.
 */
export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Executes a task within the concurrency limit.
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

/**
 * Shared store through which several processes agree on when a request may start.
 */
export interface RequestSlotStore {
  /**
   * Claims `key` for `ttlMs` when no claim is held. Resolves to 0 when the claim succeeded,
   * to the milliseconds left on the current claim when one is held, and to `undefined`
   * when the store cannot be reached.
   */
  claimSlot(key: string, ttlMs: number): Promise<number | undefined>;
}

interface SharedSlot {
  key: string;
  store: RequestSlotStore;
}

interface ThrottleWaiter {
  onAbort: () => void;
  resolve: () => void;
  signal?: AbortSignal;
}

/**
 * Spaces the start of consecutive operations at least `intervalMs` apart. Callers are
 * served in the order they ask, and an operation never waits on the previous one finishing.
 * A caller whose signal aborts leaves the queue, so it never delays the callers behind it.
 *
 * With a shared slot store the spacing also holds across processes: after its local turn a
 * caller claims the shared slot, waiting out any claim another process holds. When the
 * store cannot be reached the caller proceeds on the local spacing alone.
 */
export class RequestThrottle {
  private readonly intervalMs: number;
  private lastStartAt = Number.NEGATIVE_INFINITY;
  private readonly queue: ThrottleWaiter[] = [];
  private sharedSlot: SharedSlot | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  /**
   * Resolves once the caller may start its operation, and rejects with the signal's reason
   * when `signal` is aborted before then.
   */
  async acquire(signal?: AbortSignal): Promise<void> {
    await this.acquireLocalTurn(signal);
    if (!this.sharedSlot) {
      return;
    }

    const { key, store } = this.sharedSlot;
    for (;;) {
      const waitMs = await store.claimSlot(key, this.intervalMs);
      if (!waitMs) {
        return;
      }
      await sleep(waitMs, signal);
    }
  }

  /**
   * Also spaces requests against every other process claiming `key` in `store`.
   */
  shareSlot(store: RequestSlotStore, key: string): void {
    this.sharedSlot = { key, store };
  }

  private async acquireLocalTurn(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const waiter: ThrottleWaiter = {
        onAbort: () => {
          this.queue.splice(this.queue.indexOf(waiter), 1);
          reject(signal?.reason);
        },
        resolve,
        signal,
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.queue.push(waiter);
      this.releaseNext();
    });
  }

  private releaseNext(): void {
    const waiter = this.queue[0];
    if (!waiter || this.timer) {
      return;
    }

    const waitMs = this.lastStartAt + this.intervalMs - Date.now();
    if (waitMs > 0) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.releaseNext();
      }, waitMs);
      return;
    }

    this.queue.shift();
    this.lastStartAt = Date.now();
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    waiter.resolve();
    this.releaseNext();
  }
}

/**
 * Resolves after `ms`, or rejects with the signal's reason once `signal` aborts.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
