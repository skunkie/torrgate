// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getErrorMessage, redactErrorMessage } from '../../src/utils/error-message.js';

describe('redactErrorMessage', () => {
  it('should hide user info in URLs', () => {
    assert.equal(
      redactErrorMessage('connect failed for http://sample-user:sample-pass@proxy.example.test:8080'),
      'connect failed for http://***:***@proxy.example.test:8080'
    );
    assert.equal(
      redactErrorMessage('connect failed for https://sample-user@proxy.example.test/'),
      'connect failed for https://***@proxy.example.test/'
    );
  });

  it('should hide account-identifying query parameter values', () => {
    assert.equal(
      redactErrorMessage('GET https://tracker.example.test/dl.php?id=7&passkey=abc123&uid=42 failed'),
      'GET https://tracker.example.test/dl.php?id=7&passkey=***&uid=*** failed'
    );
    assert.equal(
      redactErrorMessage('https://gate.example.test/feed?jackett_apikey=secret&t=search'),
      'https://gate.example.test/feed?jackett_apikey=***&t=search'
    );
  });

  it('should keep messages without credentials unchanged', () => {
    assert.equal(redactErrorMessage('Tracker Sample returned an error page: Not found'), 'Tracker Sample returned an error page: Not found');
  });
});

describe('getErrorMessage', () => {
  it('should redact error messages and fall back for values without one', () => {
    assert.equal(getErrorMessage(new Error('https://tracker.example.test/?token=abc'), 'fallback'), 'https://tracker.example.test/?token=***');
    assert.equal(getErrorMessage('plain failure', 'fallback'), 'plain failure');
    assert.equal(getErrorMessage(undefined, 'fallback'), 'fallback');
    assert.equal(getErrorMessage(new Error(''), 'fallback'), 'fallback');
  });
});
