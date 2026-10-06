// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Router } from 'express';

import { getQueryString } from '../utils/query.js';
import { CLIENT_PLUGINS_SCRIPT } from './views/client-plugins-script.js';
import { LOGIN_PAGE_STYLES } from './views/login-styles.js';
import { PLUGIN_SETTINGS_SCRIPT } from './views/plugin-settings-script.js';
import {
  generateFaviconIco,
  generatePngIcon,
  getIconSvg,
  getIconVersion,
  getManifest,
  getServiceWorker,
} from './views/pwa.js';
import { QBITTORRENT_PLUGIN_SCRIPT } from './views/qbittorrent-plugin-script.js';
import { THEME_SCRIPT } from './views/theme-script.js';
import { THEME_STYLES } from './views/theme-styles.js';
import { TORRPLAY_PLUGIN_SCRIPT } from './views/torrplay-plugin-script.js';
import { WEB_CLIENT_SCRIPT } from './views/web-client-script.js';
import { WEB_CLIENT_STYLES } from './views/web-client-styles.js';

export function createAssetRouter(): Router {
  const router = Router();

  // PWA Manifest, Service Worker, and App Icons
  router.get('/manifest.webmanifest', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(getManifest());
  });

  router.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(getServiceWorker());
  });

  const iconRoutes: { contentType: string; paths: string[]; render: () => Buffer | string }[] = [
    { contentType: 'image/svg+xml', paths: ['/icon.svg'], render: getIconSvg },
    {
      contentType: 'image/png',
      paths: ['/icon-192.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'],
      render: () => generatePngIcon(192),
    },
    { contentType: 'image/png', paths: ['/icon-512.png'], render: () => generatePngIcon(512) },
    { contentType: 'image/x-icon', paths: ['/favicon.ico'], render: generateFaviconIco },
  ];

  for (const route of iconRoutes) {
    let body: Buffer | string | undefined;
    router.get(route.paths, (req, res) => {
      body ??= route.render();
      const isVersioned = getQueryString(req.query, 'v') === getIconVersion();
      res.setHeader('Content-Type', route.contentType);
      res.setHeader('Cache-Control', isVersioned ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
      res.send(body);
    });
  }

  router.get('/web-client.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.send(`${THEME_STYLES}${WEB_CLIENT_STYLES}`);
  });

  router.get('/web-client.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(`${CLIENT_PLUGINS_SCRIPT}${TORRPLAY_PLUGIN_SCRIPT}${QBITTORRENT_PLUGIN_SCRIPT}${PLUGIN_SETTINGS_SCRIPT}${WEB_CLIENT_SCRIPT}`);
  });

  router.get('/login.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.send(`${THEME_STYLES}${LOGIN_PAGE_STYLES}`);
  });

  router.get('/theme.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(THEME_SCRIPT);
  });

  return router;
}
