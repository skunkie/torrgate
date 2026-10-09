// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Matches HTTP(S) mirror schemes and ports, allowing the mirror host and its subdomains.
 */
export function findMatchingMirror(targetUrl: string, mirrors: string[]): string | undefined {
  let target: URL;
  try {
    target = new URL(targetUrl);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }

  return mirrors.find(mirror => {
    try {
      const configured = new URL(mirror);
      return target.protocol === configured.protocol && target.port === configured.port
        && (target.hostname === configured.hostname || target.hostname.endsWith(`.${configured.hostname}`));
    } catch {
      return false;
    }
  });
}
