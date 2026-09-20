// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asyncHandler } from '../../src/api/async-handler.js';

describe('asyncHandler', () => {
  const invoke = async (handler: Parameters<typeof asyncHandler>[0]): Promise<unknown> =>
    new Promise(resolve => {
      asyncHandler(handler)({} as never, {} as never, (err?: unknown) => resolve(err));
    });

  it('should pass a rejected promise to the next error handler', async () => {
    const received = await invoke(async () => {
      throw new Error('Sample async failure');
    });
    assert.match((received as Error).message, /Sample async failure/);
  });

  it('should pass a synchronous throw to the next error handler', async () => {
    const received = await invoke(() => {
      throw new TypeError('Sample sync failure');
    });
    assert.ok(received instanceof TypeError);
  });
});
