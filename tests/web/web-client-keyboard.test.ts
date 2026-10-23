// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { WEB_CLIENT_SCRIPT } from '../../src/web/client/web-client-script.js';
import { renderWebClientPage } from '../../src/web/web-client.js';

async function createKeyboardClient() {
  const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
    runScripts: 'outside-only',
    url: 'https://gateway.example.test',
  });
  const { document } = dom.window;
  const copiedMagnets: string[] = [];
  const downloads: string[] = [];
  Object.assign(dom.window, {
    fetch: async (url: string) => url === '/api/v2.0/indexers'
      ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
      : Response.json({
        Indexers: [],
        Results: ['First Sample', 'Second Sample'].map(Title => ({
          Category: [],
          Link: '/api/v2.0/indexers/sample/download?id=1',
          MagnetUri: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789',
          Size: 1024,
          Title,
          Tracker: 'Sample Tracker',
        })),
      }),
    matchMedia: () => ({ matches: false }),
    torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
  });
  Object.assign(dom.window.navigator, {
    clipboard: { writeText: async (value: string) => { copiedMagnets.push(value); } },
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  document.addEventListener('click', event => {
    if (event.target instanceof dom.window.HTMLAnchorElement && event.target.hasAttribute('download')) {
      event.preventDefault();
      downloads.push(event.target.href);
    }
  });
  dom.window.eval(WEB_CLIENT_SCRIPT);
  await new Promise<void>(resolve => setImmediate(resolve));
  document.querySelector('#search-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise<void>(resolve => setImmediate(resolve));

  function press(key: string, options: KeyboardEventInit = {}) {
    const event = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
    (document.activeElement || document.body).dispatchEvent(event);
    return event;
  }

  return { copiedMagnets, document, dom, downloads, press };
}

describe('Web client keyboard shortcuts', () => {
  for (const modifiers of [
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, shiftKey: true },
    { altKey: true, ctrlKey: true },
    { altKey: true, metaKey: true },
  ]) {
    it(`should preserve system and browser combinations with ${Object.keys(modifiers).join(', ')}`, async context => {
      const { copiedMagnets, document, dom, downloads, press } = await createKeyboardClient();
      context.after(() => dom.window.close());
      press('j');
      const selected = document.querySelector('.active-card');
      assert.ok(selected);
      for (const key of ['/', '?', 't', 'T', 'i', 'I', 'c', 'C', 'j', 'k', 'K', 'ArrowDown', 'ArrowUp', 'Enter', 'm', 'M', 'd', 'D', 'Escape']) {
        assert.equal(press(key, modifiers).defaultPrevented, false, key);
        assert.equal(document.querySelector('.active-card'), selected, key);
        assert.equal(document.querySelector('.modal-overlay.open'), null, key);
        assert.equal(document.activeElement, document.body, key);
      }
      assert.deepEqual(copiedMagnets, []);
      assert.deepEqual(downloads, []);

      const input = document.querySelector<HTMLInputElement>('#query-input')!;
      input.value = 'Sample Release';
      input.focus();
      input.setSelectionRange(2, 4);
      assert.equal(press('k', modifiers).defaultPrevented, false);
      assert.equal(press('Escape', modifiers).defaultPrevented, false);
      assert.equal(input.value, 'Sample Release');
      assert.equal(input.selectionStart, 2);
      assert.equal(input.selectionEnd, 4);

      document.querySelector<HTMLButtonElement>('#btn-open-trackers')!.click();
      for (const key of ['k', 'Escape']) {
        assert.equal(press(key, modifiers).defaultPrevented, false);
        assert.equal(document.querySelector('.modal-overlay.open')?.id, 'modal-trackers');
      }
    });
  }

  for (const markup of [
    '<input>', '<textarea></textarea>', '<select><option>Sample</option></select>',
    '<button>Sample action</button>', '<a href="#sample">Sample link</a>',
    '<div contenteditable="true" tabindex="0"><span tabindex="0">Sample text</span></div>',
    '<div role="textbox" tabindex="0">Sample text</div>',
  ]) {
    it(`should preserve keyboard interaction inside ${markup}`, async context => {
      const { copiedMagnets, document, dom, downloads, press } = await createKeyboardClient();
      context.after(() => dom.window.close());
      press('j');
      const selected = document.querySelector('.active-card');
      const container = document.createElement('div');
      container.innerHTML = markup;
      document.body.append(container);
      const control = container.querySelector<HTMLElement>('span') || container.firstElementChild as HTMLElement;
      control.focus();
      assert.equal(document.activeElement, control);
      for (const key of ['/', '?', 't', 'i', 'c', 'j', 'k', 'ArrowDown', 'ArrowUp', 'Enter', 'm', 'd']) {
        assert.equal(press(key).defaultPrevented, false, key);
        assert.equal(document.activeElement, control, key);
        assert.equal(document.querySelector('.active-card'), selected, key);
        assert.equal(document.querySelector('.modal-overlay.open'), null, key);
      }
      assert.deepEqual(copiedMagnets, []);
      assert.deepEqual(downloads, []);
    });
  }

  it('should leave composing and previously handled events alone', async context => {
    const { document, dom, press } = await createKeyboardClient();
    context.after(() => dom.window.close());
    press('j');
    const selected = document.querySelector('.active-card');
    for (const key of ['/', '?', 't', 'i', 'j', 'k', 'Enter', 'm', 'd', 'Escape']) {
      assert.equal(press(key, { isComposing: true }).defaultPrevented, false);
      const event = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
      event.preventDefault();
      document.body.dispatchEvent(event);
      assert.equal(document.querySelector('.active-card'), selected);
      assert.equal(document.querySelector('.modal-overlay.open'), null);
      assert.equal(document.activeElement, document.body);
    }
  });

  for (const options of [
    { code: 'Slash', key: '/', shiftKey: false },
    { code: 'Digit7', key: '/', shiftKey: true },
    { code: 'Slash', key: '?', shiftKey: true },
    { code: 'Minus', key: '?', shiftKey: false },
  ]) {
    it(`should use the produced ${options.key} character on ${options.code} with Shift=${String(options.shiftKey)}`, async context => {
      const { document, dom, press } = await createKeyboardClient();
      context.after(() => dom.window.close());
      assert.equal(press(options.key, options).defaultPrevented, true);
      if (options.key === '/') {
        assert.equal(document.activeElement, document.querySelector('#query-input'));
        assert.equal(document.querySelector('.modal-overlay.open'), null);
      } else {
        assert.equal(document.querySelector('.modal-overlay.open')?.id, 'modal-shortcuts');
        assert.equal(document.activeElement, document.body);
      }
    });
  }

  it('should retain page navigation, release actions, search, help, and Escape', async context => {
    const { copiedMagnets, document, dom, downloads, press } = await createKeyboardClient();
    context.after(() => dom.window.close());
    const cards = document.querySelectorAll('.torrent-card');
    for (const [key, index] of [['j', 0], ['ArrowDown', 1], ['k', 0], ['j', 1], ['ArrowUp', 0]] as const) {
      assert.equal(press(key).defaultPrevented, true);
      assert.equal(document.querySelector('.active-card'), cards[index]);
    }
    assert.equal(press('m').defaultPrevented, true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(copiedMagnets.length, 1);
    assert.equal(press('d').defaultPrevented, true);
    assert.equal(downloads.length, 1);
    assert.equal(press('Enter').defaultPrevented, true);
    assert.equal(document.querySelector('.modal-overlay.open')?.id, 'modal-details');
    press('Escape');
    assert.equal(document.querySelector('.modal-overlay.open'), null);

    for (const [key, modal] of [['t', 'modal-trackers'], ['i', 'modal-integration'], ['?', 'modal-shortcuts']] as const) {
      assert.equal(press(key).defaultPrevented, true);
      assert.equal(document.querySelector('.modal-overlay.open')?.id, modal);
      press('Escape');
    }
    assert.equal(press('/').defaultPrevented, true);
    const input = document.querySelector<HTMLInputElement>('#query-input')!;
    assert.equal(document.activeElement, input);
    input.value = 'Sample Release';
    press('Escape');
    assert.equal(input.value, '');
    press('Escape');
    assert.equal(document.activeElement, document.body);

    const searchHelp = Array.from(document.querySelectorAll('.shortcut-row'))
      .find(row => row.querySelector('.shortcut-desc')?.textContent === 'Focus search');
    assert.equal(searchHelp?.querySelector('.shortcut-keys')?.textContent, '/');
  });
});
