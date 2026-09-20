// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';

import { NextFunction, Request, RequestHandler, Response } from 'express';

import { ApiErrorResponse } from '../../types/api.js';
import { FailedAttemptLimiter } from '../../utils/rate-limiter.js';
import { isTorznabPath, TORZNAB_ERROR_CODES } from '../../utils/torznab-xml.js';
import { sendTorznabError } from '../torznab-errors.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'torrgate_session';

/**
 * Outcome of checking a request's credentials against the configured API key.
 * `blocked` means the client exceeded its failed attempts and the key was not checked.
 */
export type CredentialCheck = 'blocked' | 'invalid' | 'missing' | 'valid';

/**
 * Middleware enforcing optional API key authentication.
 *
 * When an API key is configured, incoming requests must provide a matching key via
 * a valid session cookie, the `apikey` / `api_key` / `passkey` / `jackett_apikey` query
 * parameter, the `X-Api-Key` header, or `Authorization: Bearer`.
 * With a limiter, a client that keeps sending wrong keys gets HTTP 429 until its window expires.
 * Torznab endpoints answer with Torznab `<error>` documents (codes 100 and 500) instead of JSON.
 * If no API key is configured, all requests pass through.
 */
export function apiKeyAuth(configuredKey?: string, limiter?: FailedAttemptLimiter): RequestHandler {
  return (req: Request, res: Response<ApiErrorResponse>, next: NextFunction): void => {
    const check = checkCredentials(req, configuredKey, limiter);
    if (check === 'valid') {
      next();
      return;
    }

    if (isTorznabPath(req.path)) {
      if (check === 'blocked') {
        sendTorznabError(res, 429, TORZNAB_ERROR_CODES.requestLimitReached, 'Too many failed API key attempts. Please try again later.');
      } else {
        sendTorznabError(res, 401, TORZNAB_ERROR_CODES.incorrectCredentials, 'Invalid or missing API key');
      }
      return;
    }

    if (check === 'blocked') {
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Too many failed API key attempts. Please try again later.',
        statusCode: 429,
        success: false,
      });
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      statusCode: 401,
      success: false,
    });
  };
}

/**
 * Checks a request's session cookie or API key, recording failed key attempts on the limiter.
 *
 * A valid session cookie is accepted even while the client is blocked, so a signed-in browser
 * sharing an address with someone guessing keys keeps working.
 */
export function checkCredentials(
  req: Request,
  apiKey: string | undefined,
  limiter?: FailedAttemptLimiter
): CredentialCheck {
  if (!apiKey) {
    return 'valid';
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  if (verifySessionToken(cookies[SESSION_COOKIE_NAME], apiKey)) {
    return 'valid';
  }

  const providedKey = getProvidedApiKey(req);
  if (!providedKey) {
    return 'missing';
  }

  const clientId = getClientId(req);
  if (limiter?.isBlocked(clientId)) {
    return 'blocked';
  }

  if (timingSafeCompare(providedKey, apiKey)) {
    limiter?.reset(clientId);
    return 'valid';
  }

  limiter?.recordFailure(clientId);
  return 'invalid';
}

/**
 * Creates an HMAC-signed session token.
 * Format: `<timestampMs>.<hexHmac>`
 */
export function createSessionToken(secret: string, timestamp: number = Date.now()): string {
  const timestampStr = String(timestamp);
  const hmac = crypto.createHmac('sha256', secret).update(timestampStr).digest('hex');
  return `${timestampStr}.${hmac}`;
}

/**
 * Identifies the client for rate limiting. Uses Express's `req.ip`, which honours the
 * `trust proxy` setting so clients behind a reverse proxy are told apart.
 */
export function getClientId(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Returns the API key a request carries in its query string, `X-Api-Key` header, or Bearer token.
 */
export function getProvidedApiKey(req: Request): string | undefined {
  const candidates = [
    req.query.apikey,
    req.query.api_key,
    req.query.passkey,
    req.query.jackett_apikey,
    req.headers['x-api-key'],
  ];

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    candidates.push(authHeader.slice(7).trim());
  }

  return candidates.find((value): value is string => typeof value === 'string' && value !== '');
}

/**
 * Returns a 16-character SHA-256 prefix of an API key, for partitioning cache entries
 * without storing the key itself.
 */
export function hashApiKey(key: string | undefined): string {
  if (!key) return '';
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Checks whether an incoming HTTP request has valid credentials.
 * Supports session cookies, X-Api-Key header, ?apikey= query param, or Bearer auth.
 */
export function isAuthenticated(req: Request, apiKey?: string, limiter?: FailedAttemptLimiter): boolean {
  return checkCredentials(req, apiKey, limiter) === 'valid';
}

/**
 * Parses raw Cookie header string into key-value pairs.
 */
export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    try {
      const key = decodeURIComponent(trimmed.slice(0, eqIdx).trim());
      const val = decodeURIComponent(trimmed.slice(eqIdx + 1).trim());
      cookies[key] = val;
    } catch {
      // Safe no-throw on malformed percent-encoded sequences in stray cookies
    }
  }

  return cookies;
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 */
export function timingSafeCompare(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies that a session token is correctly signed and unexpired.
 */
export function verifySessionToken(
  token: string | undefined,
  secret: string,
  maxAgeMs: number = SEVEN_DAYS_MS
): boolean {
  if (!token || !secret) {
    return false;
  }

  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) {
    return false;
  }

  const timestampStr = token.slice(0, dotIdx);
  const providedHmac = token.slice(dotIdx + 1);

  const timestamp = parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return false;
  }

  if (Date.now() - timestamp > maxAgeMs) {
    return false;
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(timestampStr).digest('hex');
  return timingSafeCompare(providedHmac, expectedHmac);
}
