// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { errorHandler } from '../../src/api/middleware/error-handler.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('Error Handler Middleware', () => {
  it('should format standard errors into JSON API error responses', () => {
    let statusCode = 200;
    let jsonBody: unknown;

    const fakeResponse = {
      json(data: unknown) {
        jsonBody = data;
        return this;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      get statusCode() {
        return statusCode;
      },
    };

    const sampleError = new Error('Database connection failed');
    sampleError.name = 'DatabaseError';

    errorHandler(sampleError, {} as never, fakeResponse as never, (() => {}) as never);

    assert.equal(statusCode, 500);
    assert.deepEqual(jsonBody, {
      error: 'DatabaseError',
      message: 'Database connection failed',
      statusCode: 500,
      success: false,
    });
  });

  it('should sanitize URLs with embedded credentials from error messages', () => {
    let statusCode = 200;
    let jsonBody: unknown;

    const fakeResponse = {
      json(data: unknown) {
        jsonBody = data;
        return this;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      get statusCode() {
        return statusCode;
      },
    };

    const sampleError = new Error('Connect error to http://admin:supersecret@proxy.internal:8080/path failed');

    errorHandler(sampleError, {} as never, fakeResponse as never, (() => {}) as never);

    const body = jsonBody as { message: string };
    assert.ok(!body.message.includes('supersecret'));
    assert.ok(!body.message.includes('admin:'));
    assert.ok(body.message.includes('http://***:***@proxy.internal:8080/path failed'));
  });
});

describe('Error handler status codes', () => {
  it('should answer a malformed JSON body with 400 instead of 500', async () => {
    const app = createApp(new ProviderRegistry(new HttpClient()), 'sample-error-key');

    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    try {
      const port = (server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/login`, {
        body: '{malformed sample json',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string; statusCode: number };
      assert.equal(body.error, 'BadRequest');
      assert.equal(body.statusCode, 400);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
