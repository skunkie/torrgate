// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';

import { NextFunction, Request, RequestHandler, Response } from 'express';

import { isTorznabPath, TORZNAB_ERROR_CODES } from '../../jackett/torznab/xml.js';
import { ApiErrorResponse } from '../../types/api.js';
import { getClientNetwork } from '../../utils/client-network.js';
import { FailedAttemptLimiter } from '../../utils/failed-attempt-limiter.js';
import { sendTorznabError } from '../torznab-errors.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'torrgate_session';

/**
 * Outcome of checking a request's credentials against the configured API key.
 * `blocked` means the client exceeded its failed attempts and the key was not checked.
 */
type CredentialCheck = 'blocked' | 'invalid' | 'missing' | 'valid';

/**
 * Middleware enforcing optional API key authentication.
 *
 * When an API key is configured, incoming requests must provide a matching key via
 * a valid session cookie, the `apikey` / `passkey` / `jackett_apikey` query parameter
 * (the names Jackett accepts), the `X-Api-Key` header, or `Authorization: Bearer`.
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
function checkCredentials(
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
export function createSessionToken(secret: string, timestampMs: number = Date.now()): string {
  const timestampText = String(timestampMs);
  const hmac = crypto.createHmac('sha256', secret).update(timestampText).digest('hex');
  return `${timestampText}.${hmac}`;
}

/**
 * Uses the trusted client address, grouping IPv6 clients by /64 and IPv4 by address.
 */
export function getClientId(req: Request): string {
  return getClientNetwork(req.ip || req.socket.remoteAddress || 'unknown');
}

/**
 * Returns the API key a request carries in its query string, `X-Api-Key` header, or Bearer token.
 */
export function getProvidedApiKey(req: Request): string | undefined {
  const candidates = [
    req.query.apikey,
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
 * Accepts the same credentials as {@link apiKeyAuth}.
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
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    try {
      const key = decodeURIComponent(trimmed.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(trimmed.slice(separatorIndex + 1).trim());
      cookies[key] = value;
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
  const firstBuffer = Buffer.from(a);
  const secondBuffer = Buffer.from(b);
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
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

  const separatorIndex = token.indexOf('.');
  if (separatorIndex === -1) {
    return false;
  }

  const timestampText = token.slice(0, separatorIndex);
  const providedHmac = token.slice(separatorIndex + 1);

  const timestampMs = parseInt(timestampText, 10);
  if (Number.isNaN(timestampMs) || timestampMs <= 0) {
    return false;
  }

  if (Date.now() - timestampMs > maxAgeMs) {
    return false;
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(timestampText).digest('hex');
  return timingSafeCompare(providedHmac, expectedHmac);
}
