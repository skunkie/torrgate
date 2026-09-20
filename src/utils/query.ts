// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Parses an integer query parameter, returning `defaultValue` when it is absent or not a number.
 */
export function safeParseInt(raw: unknown, defaultValue?: number): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return defaultValue;
  const parsed = parseInt(String(raw).trim(), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Returns the first non-empty string among the named query parameters. A parameter repeated
 * in the URL (`?q=a&q=b`) arrives as an array; its first string element is used.
 */
export function getQueryString(query: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const raw = query[name];
    const value = Array.isArray(raw) ? raw.find(item => typeof item === 'string') : raw;
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Reads the first present named query parameter as an integer no smaller than `minimum`.
 * Returns `defaultValue` when none is present, and `null` when the value is not such an integer.
 */
export function getQueryInteger(
  query: Record<string, unknown>,
  names: string[],
  minimum: number,
  defaultValue: number
): number | null;
export function getQueryInteger(
  query: Record<string, unknown>,
  names: string[],
  minimum: number
): number | null | undefined;
export function getQueryInteger(
  query: Record<string, unknown>,
  names: string[],
  minimum: number,
  defaultValue?: number
): number | null | undefined {
  const raw = getQueryString(query, ...names);
  if (raw === undefined) {
    return defaultValue;
  }
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  return trimmed !== '' && Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}
