// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { getIconUrl, getIconVersion } from './icons.js';

/**
 * Returns the lightweight Service Worker script meeting PWA installability requirements.
 */
export function getServiceWorker(): string {
  const shellAssets = [
    '/',
    '/manifest.webmanifest',
    '/theme.js',
    '/web-client.css',
    '/web-client.js',
    ...['/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png'].map(getIconUrl),
  ];
  return `// TorrGate Service Worker
const CACHE_NAME = 'torrgate-shell-${getIconVersion()}';
const SHELL_ASSETS = ${JSON.stringify(shellAssets)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for API calls, downloads, and authentication
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/logout') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first with cache fallback for the app shell
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;
}
