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
<meta name="theme-color" id="theme-color" content="#141414">
<script src="/theme.js"></script>
<link rel="stylesheet" href="/login.css">
</head>
<body>
<header class="login-header">
  <div class="header-inner">
    <div class="brand">${getBrandLogoSvg()}<span>TorrGate</span></div>
    <button type="button" class="nav-btn theme-toggle" id="theme-toggle" aria-label="Toggle color theme">
      <span id="theme-toggle-icon" aria-hidden="true">◐</span>
      <span id="theme-toggle-label">Theme</span>
    </button>
  </div>
</header>
<main class="wrap">
  <h1>API Key</h1>
  ${errorHtml}
  <form method="post" action="${action}" class="login-form">
    <input type="hidden" name="returnUrl" value="${returnUrl}">
    <input type="password" class="form-input" id="apiKey" name="apiKey" autocomplete="current-password" aria-label="API key" autofocus required>
    <div class="login-actions"><button type="submit" class="form-button primary">Sign in</button></div>
  </form>
</main>
</body>
</html>`;
}
