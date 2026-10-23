// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { ImdbId } from '../types/torrent.js';

/**
 * Normalizes an IMDb title id given with or without the `tt` prefix (`tt123456`, `123456`)
 * to its canonical form. Returns `undefined` for an empty value and `null` for one that is
 * not an IMDb title id.
 */
export function normalizeImdbId(raw: string | undefined): ImdbId | null | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const digits = /^(?:tt)?(\d{1,8})\n?(?![\s\S])/.exec(raw)?.[1];
  if (!digits || /^0+$/.test(digits)) {
    return null;
  }
  return `tt${digits.replace(/^0+/, '').padStart(7, '0')}`;
}

/**
 * Reads a search term that is itself an IMDb title id, `tt` followed by one to eight digits, as
 * Jackett's JSON search does. Like Jackett, it first drops characters other than letters,
 * digits, whitespace, and common title punctuation. Returns `undefined` for any other term.
 */
export function parseImdbIdSearchTerm(term: string): ImdbId | undefined {
  const sanitizedTerm = term
    .replace(/\p{Pd}+/gu, '-')
    .replace(/[\u0060\u00b4\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{Nd}\s\-._()@/'[\]+%]/gu, '');
  if (!/^tt\d{1,8}$/.test(sanitizedTerm)) {
    return undefined;
  }
  return normalizeImdbId(sanitizedTerm) ?? undefined;
}
