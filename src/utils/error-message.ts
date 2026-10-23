// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Query parameters whose values identify an account: tracker passkeys, API keys and session ids.
 */
const SECRET_QUERY_PARAMETER = /([?&](?:[\w-]*api[_-]?key|auth|hash|pass|passkey|password|session|sid|token|uid)=)[^&#\s"'<>]+/gi;

/**
 * Removes credentials from URLs inside an error message: user info such as
 * `https://user:pass@host` or `https://user@host` and account-identifying query parameters
 * such as `passkey=`.
 */
export function redactErrorMessage(message: string): string {
  return message
    .replace(/(https?:\/\/)([^:\s@/]+):([^@\s/]+)@/g, '$1***:***@')
    .replace(/(https?:\/\/)[^:\s@/]+@/g, '$1***@')
    .replace(SECRET_QUERY_PARAMETER, '$1***');
}

/**
 * Returns a client-safe message for a caught value, falling back when it carries none.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return redactErrorMessage(message || fallback);
}
