// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Response } from 'express';

import { BASE_PAGE_POLICY } from './page-policy.js';
import { renderLoginPage } from './views/login.js';

const LOGIN_PAGE_POLICY = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; ${BASE_PAGE_POLICY}`;

/**
 * Sends the sign-in page with its locked-down Content-Security-Policy.
 */
export function sendLoginPage(
  res: Response,
  statusCode: number,
  options: { error?: string; returnUrl?: string }
): void {
  res.status(statusCode);
  res.setHeader('Content-Security-Policy', LOGIN_PAGE_POLICY);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLoginPage({ action: '/login', ...options }));
}
