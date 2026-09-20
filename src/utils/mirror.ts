// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Returns the mirror whose host serves `targetUrl`, either exactly or as a subdomain
 * (`d.tracker.example` matches `https://tracker.example/`). Returns `undefined` when no
 * mirror matches or either URL cannot be parsed.
 */
export function findMatchingMirror(targetUrl: string, mirrors: string[]): string | undefined {
  let targetHost: string;
  try {
    targetHost = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  return mirrors.find(mirror => {
    try {
      const mirrorHost = new URL(mirror).hostname.toLowerCase();
      return targetHost === mirrorHost || targetHost.endsWith(`.${mirrorHost}`);
    } catch {
      return false;
    }
  });
}
