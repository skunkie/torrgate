// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Resolves a URL against a base URL, ensuring the scheme is safe (http, https, magnet).
 */
export function resolveSafeUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:' || resolved.protocol === 'magnet:') {
      return resolved.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}
