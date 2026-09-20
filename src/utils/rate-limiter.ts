// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

interface AttemptWindow {
  count: number;
  resetAt: number;
}

/**
 * Options for {@link FailedAttemptLimiter}.
 */
export interface FailedAttemptLimiterOptions {
  maxAttempts?: number;
  maxTrackedClients?: number;
  windowMs?: number;
}

/**
 * Counts failed credential checks per client and blocks a client once it reaches the limit
 * within a fixed window. Memory stays bounded: expired windows are pruned whenever a new
 * client is tracked, and the oldest entry is dropped once `maxTrackedClients` is reached.
 */
export class FailedAttemptLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly maxAttempts: number;
  private readonly maxTrackedClients: number;
  private readonly windowMs: number;

  constructor(options: FailedAttemptLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.maxTrackedClients = options.maxTrackedClients ?? 10_000;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /**
   * Returns whether the client has used up its failed attempts in the current window.
   */
  isBlocked(clientId: string, now: number = Date.now()): boolean {
    const window = this.attempts.get(clientId);
    if (!window) {
      return false;
    }
    if (now >= window.resetAt) {
      this.attempts.delete(clientId);
      return false;
    }
    return window.count >= this.maxAttempts;
  }

  /**
   * Records one failed attempt, starting a new window if the previous one expired.
   */
  recordFailure(clientId: string, now: number = Date.now()): void {
    const window = this.attempts.get(clientId);
    if (window && now < window.resetAt) {
      window.count += 1;
      return;
    }

    this.attempts.delete(clientId);
    if (this.attempts.size >= this.maxTrackedClients) {
      this.prune(now);
    }
    this.attempts.set(clientId, { count: 1, resetAt: now + this.windowMs });
  }

  /**
   * Clears the client's failed attempts after a successful check.
   */
  reset(clientId: string): void {
    this.attempts.delete(clientId);
  }

  /**
   * Number of clients currently tracked.
   */
  get size(): number {
    return this.attempts.size;
  }

  private prune(now: number): void {
    for (const [clientId, window] of this.attempts) {
      if (now >= window.resetAt) {
        this.attempts.delete(clientId);
      }
    }
    while (this.attempts.size >= this.maxTrackedClients) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.attempts.delete(oldest);
    }
  }
}
