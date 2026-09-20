// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, Response } from 'express';

import { ApiErrorResponse } from '../../types/api.js';

/**
 * Strips embedded user credentials from URLs within error messages to prevent credential leakage.
 */
function sanitizeErrorMessage(message: string): string {
  return message.replace(/(https?:\/\/)([^:\s@]+):([^@\s]+)@/g, '$1***:***@');
}

/**
 * Returns the HTTP status an error carries (`status` or `statusCode`, as set by
 * body-parser and http-errors), if it is a valid 4xx or 5xx code.
 */
function getErrorStatus(err: Error): number | undefined {
  const { status, statusCode } = err as Error & { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === 'number' ? status : statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate <= 599 ? candidate : undefined;
}

/**
 * Standard error handling middleware for TorrGate.
 *
 * Client errors raised by middleware (such as a malformed JSON body) keep their 4xx status.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = getErrorStatus(err) ?? (res.statusCode >= 400 ? res.statusCode : 500);
  const rawMessage = err.message || 'An unexpected error occurred';
  const errorName = statusCode === 400 ? 'BadRequest' : err.name || 'InternalServerError';

  res.status(statusCode).json({
    error: errorName,
    message: sanitizeErrorMessage(rawMessage),
    statusCode,
    success: false,
  });
}
