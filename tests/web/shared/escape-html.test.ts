// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { renderLoginPage } from '../../../src/web/login.js';
import { escapeHtml } from '../../../src/web/shared/escape-html.js';
import { renderWebClientPage } from '../../../src/web/web-client.js';

describe('server-rendered HTML escaping', () => {
  it('should escape markup delimiters, quotes, and ampersands', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#039;');
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  });

  it('should preserve empty strings and Unicode text', () => {
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml('Тестовый Релиз — Sample Release'), 'Тестовый Релиз — Sample Release');
  });

  it('should render login values as text and attribute values', context => {
    const action = '/login?sample="quoted"&other=\'value\'';
    const error = 'Тестовая ошибка <strong>Sample & "quoted"</strong>';
    const returnUrl = '/?query=<sample>&label="quoted"';
    const dom = new JSDOM(renderLoginPage({ action, error, returnUrl }));
    context.after(() => dom.window.close());
    const { document } = dom.window;

    assert.equal(document.querySelector('form')?.getAttribute('action'), action);
    assert.equal(document.querySelector('input[name="returnUrl"]')?.getAttribute('value'), returnUrl);
    const note = document.querySelector('.note.bad');
    assert.equal(note?.textContent, error);
    assert.equal(note?.children.length, 0);
  });

  it('should render the web client version as text', context => {
    const version = 'Sample <strong>Release</strong> & "quoted"';
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false, version }));
    context.after(() => dom.window.close());
    const badge = dom.window.document.querySelector('.brand-badge');

    assert.equal(badge?.textContent, `v${version}`);
    assert.equal(badge?.children.length, 0);
  });
});
