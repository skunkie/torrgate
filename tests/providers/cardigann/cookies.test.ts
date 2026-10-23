// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCookieHeader, storeCookies } from '../../../src/providers/cardigann/cookies.js';

describe('tracker cookies', () => {
  it('should merge compound cookies and honor deletions without storing directives', () => {
    const cookies = new Map<string, string>();
    storeCookies(cookies, ['session=test=token; Path=/; HttpOnly; uid=42', 'other=sample; SameSite=Lax']);
    assert.equal(formatCookieHeader(cookies), 'session=test=token; uid=42; other=sample');
    storeCookies(cookies, ['session=expired; Max-Age=0', 'uid=', 'other=updated; Secure']);
    assert.equal(formatCookieHeader(cookies), 'other=updated');
    storeCookies(cookies, ['other=expired; Max-Age=-1', 'bare-value']);
    assert.equal(formatCookieHeader(cookies), '');
  });
});
