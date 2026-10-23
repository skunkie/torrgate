// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps a route handler so a rejected promise or thrown error reaches Express's error
 * middleware. Express 4 does not do this for async handlers, and an unhandled rejection
 * terminates the Node process.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
