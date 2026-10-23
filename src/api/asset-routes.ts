// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Router } from 'express';

import { getQueryString } from '../utils/query.js';
import { LOGIN_STYLES, WEB_SCRIPT, WEB_STYLES } from '../web/assets.js';
import { generateFaviconIco, generatePngIcon, getIconSvg, getIconVersion } from '../web/pwa/icons.js';
import { getManifest } from '../web/pwa/manifest.js';
import { getServiceWorker } from '../web/pwa/service-worker.js';
import { THEME_SCRIPT } from '../web/shared/theme-script.js';

export function createAssetRouter(): Router {
  const router = Router();

  // PWA Manifest, Service Worker, and App Icons
  router.get('/manifest.webmanifest', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
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
      render: () => generatePngIcon(192, true),
    },
    { contentType: 'image/png', paths: ['/icon-512.png'], render: () => generatePngIcon(512, true) },
    { contentType: 'image/png', paths: ['/icon-maskable-192.png'], render: () => generatePngIcon(192, true) },
    { contentType: 'image/png', paths: ['/icon-maskable-512.png'], render: () => generatePngIcon(512, true) },
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
    res.send(WEB_STYLES);
  });

  router.get('/web-client.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(WEB_SCRIPT);
  });

  router.get('/login.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.send(LOGIN_STYLES);
  });

  router.get('/theme.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(THEME_SCRIPT);
  });

  return router;
}
