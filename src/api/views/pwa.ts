// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';
import zlib from 'node:zlib';

/**
 * Pre-computed CRC32 lookup table for PNG chunk generation.
 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function calculateCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const payload = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(calculateCrc32(payload), 0);

  return Buffer.concat([lenBuf, payload, crcBuf]);
}

const BACKGROUND_RGB = [15, 15, 15] as const;
const ACCENT_RGB = [16, 185, 129] as const;
const ACCENT_HEX = '#10b981';
const BACKGROUND_HEX = '#0f0f0f';

/**
 * The glyph is drawn on a 24-unit grid, placed in a 320px box centred on the
 * 512px canvas so it stays inside the maskable-icon safe zone.
 */
const GLYPH_GRID_UNITS = 24;
const GLYPH_OFFSET_PX = 96;
const GLYPH_SIZE_PX = 320;
const CANVAS_SIZE_PX = 512;

const STROKE_WIDTH = 2;
const HUB = { radius: 3, x: 12, y: 12 };
const PEER_RADIUS = 1.8;
const PEERS: readonly (readonly [number, number])[] = [
  [12, 4],
  [19, 8],
  [19, 16],
  [12, 20],
  [5, 16],
  [5, 8],
];

interface Segment {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/**
 * Spokes run from the hub ring outward so the hub needs no background fill,
 * which lets the same glyph sit on any surface.
 */
const SPOKES: readonly Segment[] = PEERS.map(([x, y]) => {
  const length = Math.hypot(x - HUB.x, y - HUB.y);
  const ratio = HUB.radius / length;
  return {
    x1: round2(HUB.x + (x - HUB.x) * ratio),
    x2: x,
    y1: round2(HUB.y + (y - HUB.y) * ratio),
    y2: y,
  };
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function distanceToSegment(px: number, py: number, segment: Segment): number {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const t = Math.max(0, Math.min(1, ((px - segment.x1) * dx + (py - segment.y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (segment.x1 + t * dx), py - (segment.y1 + t * dy));
}

/**
 * Signed distance in grid units from a point to the glyph outline; negative inside.
 */
function glyphSignedDistance(x: number, y: number): number {
  const halfStroke = STROKE_WIDTH / 2;
  let distance = Math.abs(Math.hypot(x - HUB.x, y - HUB.y) - HUB.radius) - halfStroke;
  for (const spoke of SPOKES) {
    distance = Math.min(distance, distanceToSegment(x, y, spoke) - halfStroke);
  }
  for (const [peerX, peerY] of PEERS) {
    distance = Math.min(distance, Math.hypot(x - peerX, y - peerY) - PEER_RADIUS);
  }
  return distance;
}

/**
 * Returns the peer-hub glyph as SVG child elements on the 24-unit grid.
 */
function glyphElements(color: string): string {
  const spokes = SPOKES.map(s => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>`).join('');
  const peers = PEERS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${PEER_RADIUS}" fill="${color}" stroke="none"/>`).join('');
  return `<circle cx="${HUB.x}" cy="${HUB.y}" r="${HUB.radius}"/>${spokes}${peers}`;
}

/**
 * Returns the favicon and home-screen icon link tags shared by every HTML page.
 */
export function getIconLinkTags(): string {
  return `<link rel="icon" type="image/svg+xml" href="${getIconUrl('/icon.svg')}">
  <link rel="apple-touch-icon" href="${getIconUrl('/apple-touch-icon.png')}">`;
}

let iconVersion: string | undefined;

/**
 * Returns a content hash of the rendered icons, so icon URLs change whenever the
 * artwork does and long-lived browser caches never serve a previous design.
 */
export function getIconVersion(): string {
  iconVersion ??= crypto
    .createHash('sha256')
    .update(getIconSvg())
    .update(generatePngIcon(48))
    .digest('hex')
    .slice(0, 12);
  return iconVersion;
}

/**
 * Appends the icon content version to an icon path.
 */
export function getIconUrl(path: string): string {
  return `${path}?v=${getIconVersion()}`;
}

const FAVICON_SIZES_PX = [16, 32, 48];

/**
 * Packs PNG renderings of the icon into a Windows ICO container for clients that
 * request /favicon.ico directly instead of reading the page's link tags.
 */
export function generateFaviconIco(): Buffer {
  const images = FAVICON_SIZES_PX.map(size => generatePngIcon(size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map((image, index) => {
    const entry = Buffer.alloc(16);
    entry[0] = FAVICON_SIZES_PX[index]; // Width
    entry[1] = FAVICON_SIZES_PX[index]; // Height
    entry[2] = 0; // Palette size
    entry[3] = 0; // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

/**
 * Returns the inline brand logo that inherits its color from the surrounding text.
 */
export function getBrandLogoSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" class="brand-logo">${glyphElements('currentColor')}</svg>`;
}

/**
 * Rasterizes the app icon to a PNG of the specified dimension with zero external dependencies.
 */
export function generatePngIcon(size: number): Buffer {
  const width = Math.max(16, size);
  const height = width;
  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(height * rowLen);
  const unitsPerPixel = (CANVAS_SIZE_PX / width) * (GLYPH_GRID_UNITS / GLYPH_SIZE_PX);
  const offsetUnits = (GLYPH_OFFSET_PX * GLYPH_GRID_UNITS) / GLYPH_SIZE_PX;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // Filter: None
    const gridY = (y + 0.5) * unitsPerPixel - offsetUnits;
    for (let x = 0; x < width; x++) {
      const gridX = (x + 0.5) * unitsPerPixel - offsetUnits;
      const coverage = Math.max(0, Math.min(1, 0.5 - glyphSignedDistance(gridX, gridY) / unitsPerPixel));
      const px = rowOffset + 1 + x * 4;
      for (let channel = 0; channel < 3; channel++) {
        raw[px + channel] = Math.round(
          BACKGROUND_RGB[channel] + (ACCENT_RGB[channel] - BACKGROUND_RGB[channel]) * coverage,
        );
      }
      raw[px + 3] = 255;
    }
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Adaptive filtering
  ihdr[12] = 0; // Non-interlaced

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    pngSignature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', idat),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Returns the SVG app icon.
 */
export function getIconSvg(): string {
  const scale = round2(GLYPH_SIZE_PX / GLYPH_GRID_UNITS);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE_PX} ${CANVAS_SIZE_PX}" fill="none">
  <rect width="${CANVAS_SIZE_PX}" height="${CANVAS_SIZE_PX}" rx="128" fill="${BACKGROUND_HEX}"/>
  <g transform="translate(${GLYPH_OFFSET_PX}, ${GLYPH_OFFSET_PX}) scale(${scale})" stroke="${ACCENT_HEX}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round">
    ${glyphElements(ACCENT_HEX)}
  </g>
</svg>`;
}

/**
 * Returns the W3C Web App Manifest JSON string.
 */
export function getManifest(): string {
  const manifest = {
    background_color: '#0f0f0f',
    description: 'Torrent Tracker Gateway & Search',
    display: 'standalone',
    icons: [
      {
        purpose: 'any maskable',
        sizes: 'any',
        src: getIconUrl('/icon.svg'),
        type: 'image/svg+xml',
      },
      {
        purpose: 'any maskable',
        sizes: '192x192',
        src: getIconUrl('/icon-192.png'),
        type: 'image/png',
      },
      {
        purpose: 'any maskable',
        sizes: '512x512',
        src: getIconUrl('/icon-512.png'),
        type: 'image/png',
      },
    ],
    name: 'TorrGate',
    orientation: 'any',
    scope: '/',
    short_name: 'TorrGate',
    start_url: '/',
    theme_color: '#0f0f0f',
  };

  return JSON.stringify(manifest, null, 2);
}

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
    ...['/icon.svg', '/icon-192.png', '/icon-512.png'].map(getIconUrl),
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
