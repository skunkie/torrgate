// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

const COOKIE_DIRECTIVES = new Set([
  'domain',
  'expires',
  'httponly',
  'max-age',
  'partitioned',
  'path',
  'priority',
  'samesite',
  'secure',
]);

export function formatCookieHeader(cookies: ReadonlyMap<string, string>): string {
  const pairs: string[] = [];
  for (const [key, value] of cookies.entries()) {
    pairs.push(`${key}=${value}`);
  }
  return pairs.join('; ');
}

export function storeCookies(cookies: Map<string, string>, cookieHeaders: string[]): void {
  for (const header of cookieHeaders) {
    const parts = header.split(';');
    let currentCookieName: string | null = null;

    for (const part of parts) {
      const trimmed = part.trim();
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex > 0) {
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        const lowerKey = key.toLowerCase();

        if (COOKIE_DIRECTIVES.has(lowerKey)) {
          if (lowerKey === 'max-age' && (value === '0' || value.startsWith('-'))) {
            if (currentCookieName) {
              cookies.delete(currentCookieName);
            }
          }
        } else {
          currentCookieName = key;
          if (value === '') {
            cookies.delete(key);
          } else {
            cookies.set(key, value);
          }
        }
      }
    }
  }
}
