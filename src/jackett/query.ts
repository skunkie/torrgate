// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { getQueryString } from '../utils/query.js';

export const INT32_MAX = 2_147_483_647;

/**
 * Reads a Torznab parameter as Jackett's ASP.NET Core binding does: the first value as it was
 * sent, or `undefined` when the parameter is absent, empty, or only whitespace.
 */
export function getTorznabQueryString(query: Record<string, unknown>, name: string): string | undefined {
  const value = getQueryString(query, name);
  return value?.trim() ? value : undefined;
}

/**
 * Reads a request URL with ASP.NET's case-insensitive keys, retaining each key's first spelling
 * and the URL order of its values.
 */
export function parseRequestQuery(url: string): URLSearchParams {
  const queryStart = url.indexOf('?');
  const parameters = new URLSearchParams(queryStart < 0 ? '' : url.slice(queryStart + 1));
  const names = new Map<string, string>();
  const parsed = new URLSearchParams();
  for (const [name, value] of parameters) {
    const key = name.toLowerCase();
    const firstName = names.get(key) ?? name;
    names.set(key, firstName);
    parsed.append(firstName, value);
  }
  return parsed;
}

/**
 * Returns the query parameters keyed by lowercase name, as ASP.NET model binding matches
 * names case-insensitively. Values of names that differ only in case are combined in URL order.
 */
export function foldQueryNameCase(query: Record<string, unknown> | URLSearchParams): Record<string, unknown> {
  const folded: Record<string, unknown> = Object.create(null);
  for (const [name, value] of query instanceof URLSearchParams ? query : Object.entries(query)) {
    const key = name.toLowerCase();
    folded[key] = key in folded ? [folded[key], value].flat() : value;
  }
  return folded;
}

/**
 * Parses a Torznab integer such as `season`, `year`, or a `cat` entry as Jackett does: a signed
 * 32-bit integer with optional surrounding whitespace. Returns `undefined` when the value is
 * absent or blank, and `null` when it is not such an integer.
 */
export function parseTorznabInteger(raw: string | undefined): number | null | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= -INT32_MAX - 1 && value <= INT32_MAX ? value : null;
}

/**
 * Reads a Torznab `limit` or `offset` value as Jackett's `ParseUtil.CoerceInt` does: only
 * digits, `.`, and `,` are kept and an empty result reads as 0. With only one kind of separator
 * both group digits, so `-5` reads as 5 and `1.5` as 15; with both, `,` groups digits and `.`
 * starts a fraction that must be zero. Returns `undefined` when the value is absent or blank,
 * and `null` when it is not a 32-bit integer after coercion.
 */
export function coerceTorznabInteger(raw: string | undefined): number | null | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const kept = raw.replace(/[^\p{Nd}.,]/gu, '');
  if (kept === '') {
    return 0;
  }

  let integerText = kept.replace(/[.,]/g, '');
  if (kept.includes(',') && kept.includes('.')) {
    const pointIndex = kept.indexOf('.');
    if (!/^0*$/.test(kept.slice(pointIndex + 1))) {
      return null;
    }
    integerText = kept.slice(0, pointIndex).replace(/,/g, '');
  }
  if (!/^\d+$/.test(integerText)) {
    return null;
  }
  const value = Number(integerText);
  return value <= INT32_MAX ? value : null;
}
