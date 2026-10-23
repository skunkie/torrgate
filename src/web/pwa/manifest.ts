// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { BACKGROUND_HEX } from './colors.js';
import { getIconUrl } from './icons.js';

/**
 * Returns the W3C Web App Manifest JSON string.
 */
export function getManifest(): string {
  const manifest = {
    background_color: BACKGROUND_HEX,
    description: 'Torrent Tracker Gateway & Search',
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: getIconUrl('/icon-192.png'),
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: getIconUrl('/icon-512.png'),
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '192x192',
        src: getIconUrl('/icon-maskable-192.png'),
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: getIconUrl('/icon-maskable-512.png'),
        type: 'image/png',
      },
    ],
    name: 'TorrGate',
    orientation: 'any',
    scope: '/',
    short_name: 'TorrGate',
    start_url: '/',
    theme_color: BACKGROUND_HEX,
  };

  return JSON.stringify(manifest, null, 2);
}
