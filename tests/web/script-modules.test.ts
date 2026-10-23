// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Linter } from 'eslint';
import { JSDOM } from 'jsdom';

import { DETAILS_SCRIPT } from '../../src/web/client/details-script.js';
import { FORMATTING_SCRIPT } from '../../src/web/client/formatting-script.js';
import { INSTALL_SCRIPT } from '../../src/web/client/install-script.js';
import { KEYBOARD_SCRIPT } from '../../src/web/client/keyboard-script.js';
import { MAGNETS_SCRIPT } from '../../src/web/client/magnets-script.js';
import { RESULTS_SCRIPT } from '../../src/web/client/results-script.js';
import { SEARCH_SCRIPT } from '../../src/web/client/search-script.js';
import { TRACKERS_SCRIPT } from '../../src/web/client/trackers-script.js';
import { UI_SCRIPT } from '../../src/web/client/ui-script.js';
import { renderWebClientPage } from '../../src/web/web-client.js';

describe('browser module dependencies', () => {
  it('should resolve each factory independently using its parameters and browser globals', () => {
    const linter = new Linter();
    const globals = Object.fromEntries([
      'AbortController', 'document', 'fetch', 'localStorage', 'navigator', 'setTimeout', 'URL', 'URLSearchParams', 'window',
    ].map(name => [name, 'readonly' as const]));
    for (const source of [DETAILS_SCRIPT, FORMATTING_SCRIPT, INSTALL_SCRIPT, KEYBOARD_SCRIPT, MAGNETS_SCRIPT, RESULTS_SCRIPT, SEARCH_SCRIPT, TRACKERS_SCRIPT, UI_SCRIPT]) {
      const messages = linter.verify(source, {
        languageOptions: { ecmaVersion: 2022, globals },
        rules: {
          'no-restricted-properties': ['error', {
            message: 'Receive plugin actions through the factory parameters.',
            object: 'window',
            property: 'torrGatePluginUi',
          }],
          'no-undef': 'error',
        },
      });
      assert.deepEqual(messages, []);
    }
  });

  it('should render injected plugin actions in results and release details', context => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test/',
    });
    context.after(() => dom.window.close());
    dom.window.eval([FORMATTING_SCRIPT, DETAILS_SCRIPT, RESULTS_SCRIPT, String.raw`
      const state = {
        activeResultIndex: -1,
        currentResults: [{ MagnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567', Peers: 0, Seeders: 1, Size: 1024, Title: 'Sample Release', Tracker: 'Sample Tracker' }],
        detailsItem: null,
      };
      const dependencies = {
        ...createFormatting(),
        getMagnetEndpoint: () => null,
        indexerWarnings: document.getElementById('indexer-warnings'),
        modalDetails: document.getElementById('modal-details'),
        openModal: () => {},
        renderPluginActions: (item, index) => '<button class="sample-plugin-action" data-index="' + index + '">' + item.Title + '</button>',
        resolveMagnet: async () => null,
        resultsBar: document.getElementById('results-bar'),
        resultsList: document.getElementById('results-list'),
        resultsStats: document.getElementById('results-stats'),
        showToast: () => {},
        sortSelect: document.getElementById('sort-select'),
        state,
      };
      createResults(dependencies).sortAndRenderResults();
      createDetails(dependencies).viewDetails(0);
    `].join('\n'));

    for (const selector of ['#results-list', '#details-modal-body']) {
      const action = dom.window.document.querySelector(`${selector} .sample-plugin-action`);
      assert.ok(action);
      assert.equal(action.textContent, 'Sample Release');
      assert.equal(action.getAttribute('data-index'), '0');
    }
    const actions = dom.window.document.querySelector('.torrent-actions');
    assert.equal(actions?.firstElementChild?.className, 'sample-plugin-action');
    assert.ok(actions?.querySelector('.btn-copy-magnet'));
  });
});
