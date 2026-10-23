// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

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
