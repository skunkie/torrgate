// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { WEB_SCRIPT } from '../../src/web/assets.js';
import { renderWebClientPage } from '../../src/web/web-client.js';

describe('composed browser assets', () => {
  it('should initialize bundled plugins and search using the served script composition', async context => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test/',
    });
    context.after(() => dom.window.close());
    Object.assign(dom.window, {
      fetch: async (url: string) => url === '/api/v2.0/indexers'
        ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
        : Response.json({ Indexers: [], Results: [{ Peers: 0, Seeders: 1, Title: 'Sample Release', Tracker: 'Sample Tracker' }] }),
      matchMedia: () => ({ matches: false }),
    });
    dom.window.eval(WEB_SCRIPT);
    await new Promise<void>(resolve => setImmediate(resolve));
    const { document } = dom.window;
    const pluginOptions = [...document.querySelectorAll<HTMLOptionElement>('#plugin-instance-plugin option')].map(option => option.value);
    assert.deepEqual(pluginOptions.sort(), ['qbittorrent', 'torrplay']);
    document.querySelector('#search-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(document.querySelector('.torrent-title')?.textContent, 'Sample Release');
    document.querySelector<HTMLButtonElement>('.btn-view-details')!.click();
    assert.equal(document.querySelector('#details-modal-title')?.textContent, 'Sample Release');
  });
});
