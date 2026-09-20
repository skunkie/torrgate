// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Response } from 'express';

import { renderTorznabError, TorznabErrorCode } from '../utils/torznab-xml.js';

/**
 * Sends a Torznab `<error>` document with the given HTTP status.
 */
export function sendTorznabError(
  res: Response,
  statusCode: number,
  code: TorznabErrorCode,
  description: string
): void {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(renderTorznabError(code, description));
}
