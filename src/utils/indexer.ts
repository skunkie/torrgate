// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

const INDEXER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates whether an indexer identifier contains only safe alphanumeric, underscore, or hyphen characters.
 */
export function isValidIndexerId(indexerId: string): boolean {
  return INDEXER_ID_REGEX.test(indexerId);
}
