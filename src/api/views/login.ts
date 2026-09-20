// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { getBrandLogoSvg, getIconLinkTags } from './pwa.js';

export interface RenderLoginOptions {
  action?: string;
  error?: string;
  returnUrl?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderLoginPage(options?: RenderLoginOptions): string {
  const action = options?.action ? escapeHtml(options.action) : '/login';
  const returnUrl = options?.returnUrl ? escapeHtml(options.returnUrl) : '/';
  const errorHtml = options?.error
    ? `<div class="note bad" role="alert">${escapeHtml(options.error)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in &middot; TorrGate</title>
${getIconLinkTags()}
<meta name="theme-color" id="theme-color" content="#0f0f0f">
<script src="/theme.js"></script>
<link rel="stylesheet" href="/login.css">
</head>
<body>
<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle color theme">
  <span id="theme-toggle-icon" aria-hidden="true">◐</span>
  <span id="theme-toggle-label">Theme</span>
</button>
<div class="wrap">
  <h1 class="brand">
    ${getBrandLogoSvg()}
    TorrGate
  </h1>
  ${errorHtml}
  <form method="post" action="${action}" class="card">
    <input type="hidden" name="returnUrl" value="${returnUrl}">
    <div class="field">
      <label for="apiKey">API Key</label>
      <input type="password" id="apiKey" name="apiKey" autocomplete="current-password" autofocus required>
    </div>
    <button type="submit">Sign in</button>
  </form>
</div>
</body>
</html>`;
}
