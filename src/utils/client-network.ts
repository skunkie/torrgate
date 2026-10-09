// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { isIP } from 'node:net';

/**
 * Groups IPv6 clients by /64 for throttling and treats IPv4-mapped addresses as IPv4
 * clients. Other address strings are preserved.
 */
export function getClientNetwork(address: string): string {
  if (isIP(address) !== 6) return address;
  const normalized = new URL(`http://[${address.split('%')[0]}]/`).hostname.slice(1, -1);
  const [left, right = ''] = normalized.split('::');
  const leftSegments = left ? left.split(':') : [];
  const rightSegments = right ? right.split(':') : [];
  const segments = normalized.includes('::')
    ? [...leftSegments, ...Array<string>(8 - leftSegments.length - rightSegments.length).fill('0'), ...rightSegments]
    : leftSegments;
  const numbers = segments.map(segment => Number.parseInt(segment, 16));
  if (numbers.slice(0, 5).every(number => number === 0) && numbers[5] === 0xffff) {
    return [numbers[6] >> 8, numbers[6] & 0xff, numbers[7] >> 8, numbers[7] & 0xff].join('.');
  }
  return `${numbers.slice(0, 4).map(number => number.toString(16).padStart(4, '0')).join(':')}::/64`;
}
