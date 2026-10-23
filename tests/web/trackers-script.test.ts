// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { JackettIndexer } from '../../src/jackett/types.js';
import { WEB_CLIENT_SCRIPT } from '../../src/web/client/web-client-script.js';
import { renderWebClientPage } from '../../src/web/web-client.js';

const TEST_INDEXERS: JackettIndexer[] = [
  {
    caps: {},
    configured: true,
    id: 'sample-online',
    links: ['https://tracker.example.test/?a=1&b=2'],
    name: 'Sample Online Tracker',
    site_link: 'https://tracker.example.test/?a=1&b=2',
    type: 'public',
  },
  {
    caps: {},
    configured: true,
    id: 'sample-offline',
    links: [],
    name: 'Sample Offline Tracker',
    site_link: '',
    type: 'public',
  },
];

describe('browser tracker metadata', () => {
  for (const { expectedIds, savedIds } of [
    { expectedIds: ['sample-online', 'sample-offline'], savedIds: ['sample-online', 'removed-tracker'] },
    { expectedIds: ['sample-online', 'sample-offline'], savedIds: ['sample-online', 'sample-online'] },
    { expectedIds: [], savedIds: ['sample-online', 'sample-offline', 'removed-tracker'] },
  ]) {
    it(`should toggle configured trackers with saved IDs ${JSON.stringify(savedIds)}`, async context => {
      const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
        runScripts: 'outside-only',
        url: 'https://gateway.example.test/',
      });
      context.after(() => dom.window.close());
      dom.window.localStorage.setItem('torrgate_enabled_trackers', JSON.stringify(savedIds));
      Object.assign(dom.window, {
        fetch: async () => Response.json(TEST_INDEXERS),
        matchMedia: () => ({ matches: false }),
        torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
      });
      dom.window.eval(WEB_CLIENT_SCRIPT);
      await new Promise<void>(resolve => setImmediate(resolve));
      const { document } = dom.window;
      const toggleButton = document.querySelector<HTMLButtonElement>('#btn-toggle-all');
      assert.ok(toggleButton);
      assert.equal(toggleButton.textContent, expectedIds.length === 0 ? 'Deselect All' : 'Select All');

      toggleButton.click();

      assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('torrgate_enabled_trackers')!), expectedIds);
      const toggles = [...document.querySelectorAll<HTMLInputElement>('#tracker-table-body input[data-tracker-id]')];
      assert.deepEqual(toggles.map(toggle => toggle.checked), TEST_INDEXERS.map(indexer => expectedIds.includes(indexer.id)));
    });
  }

  it('should render the indexer site links, including an empty site link', async context => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test/',
    });
    context.after(() => dom.window.close());
    Object.assign(dom.window, {
      fetch: async () => Response.json(TEST_INDEXERS),
      matchMedia: () => ({ matches: false }),
      torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
    });
    dom.window.eval(WEB_CLIENT_SCRIPT);
    await new Promise<void>(resolve => setImmediate(resolve));

    const links = [...dom.window.document.querySelectorAll<HTMLAnchorElement>('#tracker-table-body .tracker-link')];
    assert.deepEqual(links.map(link => link.getAttribute('href')), TEST_INDEXERS.map(indexer => indexer.site_link));
    assert.deepEqual(links.map(link => link.textContent), TEST_INDEXERS.map(indexer => indexer.site_link));
  });

  it('should render and cache the status map from the health response and disable offline trackers', async context => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test/',
    });
    context.after(() => dom.window.close());
    const statusMap = { 'Sample Offline Tracker': false, 'Sample Online Tracker': true };
    Object.assign(dom.window, {
      fetch: async (url: string) => {
        if (url === '/api/v2.0/indexers') return Response.json(TEST_INDEXERS);
        assert.equal(url, '/api/v2.0/indexers/status');
        return Response.json([statusMap]);
      },
      matchMedia: () => ({ matches: false }),
      torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
    });
    dom.window.eval(WEB_CLIENT_SCRIPT);
    await new Promise<void>(resolve => setImmediate(resolve));
    const document = dom.window.document;
    const checkButton = document.querySelector<HTMLButtonElement>('#btn-check-trackers')!;
    checkButton.click();
    await new Promise<void>(resolve => setImmediate(resolve));

    const statuses = [...document.querySelectorAll('#tracker-table-body tr td:nth-child(2)')];
    assert.deepEqual(statuses.map(status => status.textContent), ['Online', 'Offline']);
    const cachedHealth = JSON.parse(dom.window.localStorage.getItem('torrgate_tracker_health')!);
    assert.deepEqual(cachedHealth.statusMap, statusMap);
    assert.equal(typeof cachedHealth.checkedAt, 'number');
    assert.equal(checkButton.disabled, false);
    assert.match(checkButton.textContent || '', /Check Availability/);

    const disableButton = document.querySelector<HTMLButtonElement>('#btn-disable-offline')!;
    assert.equal(disableButton.classList.contains('is-hidden'), false);
    disableButton.click();
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('torrgate_enabled_trackers')!), ['sample-online']);
    const toggles = [...document.querySelectorAll<HTMLInputElement>('#tracker-table-body input[data-tracker-id]')];
    assert.deepEqual(toggles.map(toggle => toggle.checked), [true, false]);
  });
});
