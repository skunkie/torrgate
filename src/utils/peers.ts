// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

const MAX_REALISTIC_PEER_COUNT = 5_000_000;

/**
 * Resiliently parses a seeder or leecher count from scraper output.
 */
export function parsePeerCount(rawCount: number | string | null | undefined): number {
  if (rawCount === null || rawCount === undefined) {
    return 0;
  }

  if (typeof rawCount === 'number') {
    if (isNaN(rawCount) || rawCount < 0 || rawCount >= MAX_REALISTIC_PEER_COUNT) {
      return 0;
    }
    return Math.floor(rawCount);
  }

  const cleaned = rawCount.toString().replace(/[\s\u00A0\u202F,.']/g, '');
  const parsed = parseInt(cleaned, 10);

  if (isNaN(parsed) || parsed < 0 || parsed >= MAX_REALISTIC_PEER_COUNT) {
    return 0;
  }

  return parsed;
}
