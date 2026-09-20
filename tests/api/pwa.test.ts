// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import zlib from 'node:zlib';

import { renderLoginPage } from '../../src/api/views/login.js';
import {
  generateFaviconIco,
  generatePngIcon,
  getBrandLogoSvg,
  getIconLinkTags,
  getIconSvg,
  getIconUrl,
  getIconVersion,
} from '../../src/api/views/pwa.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

/**
 * Reads one RGB pixel from an unfiltered RGBA PNG produced by generatePngIcon.
 */
function readPixel(png: Buffer, x: number, y: number): [number, number, number] {
  const width = png.readUInt32BE(16);
  const idatLength = png.readUInt32BE(33);
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
  const offset = y * (1 + width * 4) + 1 + x * 4;
  return [raw[offset], raw[offset + 1], raw[offset + 2]];
}

const ACCENT: [number, number, number] = [16, 185, 129];
const BACKGROUND: [number, number, number] = [15, 15, 15];

describe('App icon rendering', () => {
  it('draws the peer-hub glyph in the SVG icon', () => {
    const svg = getIconSvg();
    assert.equal(svg.match(/<circle /g)?.length, 7);
    assert.equal(svg.match(/<line /g)?.length, 6);
  });

  it('rasterizes the same hub, ring hole, and peers into the PNG icon', () => {
    const png = generatePngIcon(512);
    assert.equal(png.readUInt32BE(16), 512);
    assert.deepEqual(readPixel(png, 4, 4), BACKGROUND);
    assert.deepEqual(readPixel(png, 256, 256), BACKGROUND);
    assert.deepEqual(readPixel(png, 296, 256), ACCENT);
    assert.deepEqual(readPixel(png, 256, 149), ACCENT);
    assert.deepEqual(readPixel(png, 349, 202), ACCENT);
  });

  it('anti-aliases glyph edges at small sizes', () => {
    const png = generatePngIcon(48);
    const width = 48;
    const greens = new Set<number>();
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        greens.add(readPixel(png, x, y)[1]);
      }
    }
    assert.ok(greens.size > 2);
  });

  it('links the favicon and home-screen icon from the login page', () => {
    const html = renderLoginPage();
    assert.ok(html.includes(getIconLinkTags()));
  });

  it('versions icon URLs by content hash', () => {
    assert.match(getIconVersion(), /^[0-9a-f]{12}$/);
    assert.equal(getIconUrl('/icon.svg'), `/icon.svg?v=${getIconVersion()}`);
    assert.ok(getIconLinkTags().includes(`href="/icon.svg?v=${getIconVersion()}"`));
    assert.ok(getIconLinkTags().includes(`href="/apple-touch-icon.png?v=${getIconVersion()}"`));
  });

  it('packs 16, 32, and 48 pixel PNG renderings into the favicon ICO', () => {
    const ico = generateFaviconIco();
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 3);
    for (const [index, size] of [16, 32, 48].entries()) {
      const entryOffset = 6 + index * 16;
      assert.equal(ico[entryOffset], size);
      assert.equal(ico[entryOffset + 1], size);
      assert.equal(ico.readUInt16LE(entryOffset + 6), 32);
      const imageLength = ico.readUInt32LE(entryOffset + 8);
      const imageOffset = ico.readUInt32LE(entryOffset + 12);
      const image = ico.subarray(imageOffset, imageOffset + imageLength);
      assert.deepEqual(image, generatePngIcon(size));
    }
  });

  it('renders the brand logo with inherited color', () => {
    const logo = getBrandLogoSvg();
    assert.ok(logo.includes('stroke="currentColor"'));
    assert.ok(logo.includes('class="brand-logo"'));
  });
});

describe('PWA & Mobile Installability Endpoints', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const httpClient = new HttpClient(undefined, 5000);
    const registry = new ProviderRegistry(httpClient);
    const app = createApp(registry);

    server = http.createServer(app);
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('GET /manifest.webmanifest should return valid W3C Web App Manifest', async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/manifest\+json/);

    const manifest = (await res.json()) as {
      background_color: string;
      display: string;
      icons: { sizes: string; src: string; type: string }[];
      name: string;
      short_name: string;
      start_url: string;
      theme_color: string;
    };

    assert.equal(manifest.name, 'TorrGate');
    assert.equal(manifest.short_name, 'TorrGate');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.theme_color, '#0f0f0f');
    assert.equal(manifest.background_color, '#0f0f0f');
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.some(icon => icon.src === getIconUrl('/icon.svg')));
    assert.ok(manifest.icons.some(icon => icon.src === getIconUrl('/icon-192.png')));
    assert.ok(manifest.icons.some(icon => icon.src === getIconUrl('/icon-512.png')));
  });

  it('GET /sw.js should serve valid Service Worker script', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/javascript/);

    const script = await res.text();
    assert.ok(script.includes("addEventListener('install'"));
    assert.ok(script.includes("addEventListener('fetch'"));
    assert.ok(script.includes(`torrgate-shell-${getIconVersion()}`));
    assert.ok(script.includes(`"${getIconUrl('/icon-512.png')}"`));
    assert.ok(script.includes('"/theme.js"'));
    assert.ok(script.includes('"/web-client.css"'));
    assert.ok(script.includes('"/web-client.js"'));
  });

  it('GET /icon.svg should serve valid SVG icon', async () => {
    const res = await fetch(`${baseUrl}/icon.svg`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/svg\+xml/);

    const svg = await res.text();
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('viewBox="0 0 512 512"'));
  });

  it('GET /icon-192.png should return valid 192x192 PNG buffer', async () => {
    const res = await fetch(`${baseUrl}/icon-192.png`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/png/);

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 100);
    // Check PNG signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50);
    assert.equal(buffer[2], 0x4e);
    assert.equal(buffer[3], 0x47);
  });

  it('GET /icon-512.png should return valid 512x512 PNG buffer', async () => {
    const res = await fetch(`${baseUrl}/icon-512.png`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/png/);

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 100);
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50);
    assert.equal(buffer[2], 0x4e);
    assert.equal(buffer[3], 0x47);
  });

  it('GET /apple-touch-icon.png should return valid PNG image', async () => {
    const res = await fetch(`${baseUrl}/apple-touch-icon.png`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/png/);

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 100);
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50);
    assert.equal(buffer[2], 0x4e);
    assert.equal(buffer[3], 0x47);
  });

  it('GET /login should link the favicon and allow it through the Content-Security-Policy', async () => {
    const httpClient = new HttpClient(undefined, 5000);
    const app = createApp(new ProviderRegistry(httpClient), { apiKey: 'sample-api-key' });
    const authServer = http.createServer(app);
    await new Promise<void>(resolve => authServer.listen(0, '127.0.0.1', () => resolve()));
    try {
      const address = authServer.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/login`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-security-policy') || '', /img-src 'self'/);
      assert.ok((await res.text()).includes(getIconLinkTags()));

      const iconRes = await fetch(`http://127.0.0.1:${port}${getIconUrl('/icon.svg')}`);
      assert.equal(iconRes.status, 200);
    } finally {
      await new Promise<void>(resolve => authServer.close(() => resolve()));
    }
  });

  it('GET /favicon.ico should serve the ICO for clients that skip link tags', async () => {
    const res = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/x-icon/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), generateFaviconIco());
  });

  it('caches versioned icon URLs immutably and unversioned ones for a day', async () => {
    for (const path of ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
      const versioned = await fetch(`${baseUrl}${getIconUrl(path)}`);
      assert.equal(versioned.headers.get('cache-control'), 'public, max-age=31536000, immutable', path);

      const unversioned = await fetch(`${baseUrl}${path}`);
      assert.equal(unversioned.headers.get('cache-control'), 'public, max-age=86400', path);

      const stale = await fetch(`${baseUrl}${path}?v=000000000000`);
      assert.equal(stale.headers.get('cache-control'), 'public, max-age=86400', path);
    }
  });

  it('pairs every HTML document in the source with the icon link tags', async () => {
    const sourceFiles = await fs.readdir(path.resolve('src'), { recursive: true });
    let documentCount = 0;
    for (const file of sourceFiles.filter(name => name.endsWith('.ts'))) {
      const source = await fs.readFile(path.resolve('src', file), 'utf8');
      const doctypes = source.match(/<!doctype html>/gi)?.length ?? 0;
      const iconLinks = source.match(/\$\{getIconLinkTags\(\)\}/g)?.length ?? 0;
      documentCount += doctypes;
      assert.equal(iconLinks, doctypes, `${file} renders ${doctypes} HTML documents but links icons ${iconLinks} times`);
    }
    assert.ok(documentCount > 0);
  });

  it('links the app icons from every HTML page', async () => {
    const authApp = createApp(new ProviderRegistry(new HttpClient(undefined, 5000)), { apiKey: 'sample-api-key' });
    const authServer = http.createServer(authApp);
    await new Promise<void>(resolve => authServer.listen(0, '127.0.0.1', () => resolve()));
    try {
      const address = authServer.address();
      const authBaseUrl = address && typeof address === 'object' ? `http://127.0.0.1:${address.port}` : '';
      const pageUrls = [
        `${baseUrl}/`,
        `${baseUrl}/docs`,
        `${baseUrl}/api/v2.0/indexers/docs`,
        `${authBaseUrl}/login`,
      ];
      for (const pageUrl of pageUrls) {
        const res = await fetch(pageUrl, { redirect: 'manual' });
        assert.equal(res.status, 200, pageUrl);
        assert.match(res.headers.get('content-type') || '', /text\/html/, pageUrl);
        assert.ok((await res.text()).includes(getIconLinkTags()), pageUrl);
      }
    } finally {
      await new Promise<void>(resolve => authServer.close(() => resolve()));
    }
  });

  it('GET / web client HTML should include manifest link, icons, and Apple mobile meta tags', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest">'));
    assert.ok(html.includes(getIconLinkTags()));
    assert.ok(html.includes('<meta name="theme-color" id="theme-color" content="#0f0f0f">'));
    assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
    assert.ok(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'));
    assert.ok(html.includes('<meta name="apple-mobile-web-app-title" content="TorrGate">'));
    assert.ok(html.includes('id="btn-install-app"'));
    assert.ok(html.includes(getBrandLogoSvg()));
  });
});
