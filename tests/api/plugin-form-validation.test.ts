// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { JSDOM } from 'jsdom';

import { CLIENT_PLUGINS_SCRIPT } from '../../src/api/views/client-plugins-script.js';
import { PLUGIN_SETTINGS_SCRIPT } from '../../src/api/views/plugin-settings-script.js';
import { QBITTORRENT_PLUGIN_SCRIPT } from '../../src/api/views/qbittorrent-plugin-script.js';
import { TORRPLAY_PLUGIN_SCRIPT } from '../../src/api/views/torrplay-plugin-script.js';
import { renderWebClientPage } from '../../src/api/views/web-client.js';
import { browserStorageCoordinator } from '../fixtures/browser-storage.js';

interface PluginUi {
  initialize(context: {
    closeModal(): void;
    escapeHtml(value: string): string;
    openModal(): void;
    refreshActions(): void;
    resolveMagnet(): Promise<null>;
    showToast(message: string): void;
  }): void;
}

function createFormEnvironment() {
  const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), { url: 'https://gate.example' });
  const { window } = dom;
  const document = window.document;
  const form = document.querySelector<HTMLFormElement>('#plugin-instance-form');
  assert.ok(form);
  const requests: { init: RequestInit; url: string }[] = [];
  let complete: ((message: string) => void) | undefined;
  runInNewContext(CLIENT_PLUGINS_SCRIPT + TORRPLAY_PLUGIN_SCRIPT + QBITTORRENT_PLUGIN_SCRIPT + PLUGIN_SETTINGS_SCRIPT, {
    AbortSignal,
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    crypto: window.crypto,
    document,
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ init, url });
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'sample-access-token', expires_in: 3600, token_type: 'Bearer' });
      if (url.endsWith('/app/version')) return new Response('v5.2.0');
      return Response.json({ torrents: [] });
    },
    indexedDB: browserStorageCoordinator(new Map()),
    localStorage: window.localStorage,
    window,
  });
  const ui = window.torrGatePluginUi as PluginUi;
  ui.initialize({
    closeModal: () => {},
    escapeHtml: value => value,
    openModal: () => {},
    refreshActions: () => {},
    resolveMagnet: async () => null,
    showToast: message => {
      complete?.(message);
      complete = undefined;
    },
  });

  function input(id: string) {
    const element = document.querySelector<HTMLInputElement>('#' + id);
    assert.ok(element);
    return element;
  }

  function select(id: string, value: string) {
    const element = document.querySelector<HTMLSelectElement>('#' + id);
    assert.ok(element);
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  function click(id: string) {
    const button = document.querySelector<HTMLButtonElement>('#' + id);
    assert.ok(button);
    button.click();
  }

  function perform(action: () => void) {
    return new Promise<string>(resolve => {
      complete = resolve;
      action();
    });
  }

  return { click, close: () => window.close(), document, form, input, perform, requests, select };
}

const SAMPLE_API_KEY = 'qbt_' + 'a'.repeat(28);

describe('Plugin form constraint validation', { timeout: 5000 }, () => {
  for (const authType of ['basic', 'bearer']) {
    it('accepts passwords and completes ' + authType + ' connection tests when changing plugins', async () => {
      const environment = createFormEnvironment();
      try {
        environment.select('plugin-instance-plugin', 'qbittorrent');
        environment.input('plugin-instance-name').value = 'Downloads';
        environment.input('plugin-instance-url').value = 'https://qbit.example';
        const secret = environment.input('plugin-instance-secret');
        secret.value = SAMPLE_API_KEY;
        assert.equal(environment.form.checkValidity(), true);
        await environment.perform(() => environment.click('btn-plugin-test'));
        assert.equal(environment.document.getElementById('plugin-connection-status')?.textContent, 'Connection successful');

        environment.select('plugin-instance-plugin', 'torrplay');
        environment.select('plugin-instance-auth', authType);
        environment.input('plugin-instance-url').value = 'https://play.example';
        environment.input('plugin-instance-username').value = 'sample-user';
        for (const password of ['sample-password!', 'Пример пароля: 42', SAMPLE_API_KEY]) {
          secret.value = password;
          assert.equal(secret.checkValidity(), true);
          assert.equal(environment.form.checkValidity(), true);
        }
        secret.value = 'sample-password!';
        await environment.perform(() => environment.click('btn-plugin-test'));
        assert.equal(environment.document.getElementById('plugin-connection-status')?.textContent, 'Connection successful');
        if (authType === 'bearer') {
          await environment.perform(() => environment.click('btn-plugin-token'));
          const stored = JSON.parse(environment.document.defaultView!.localStorage.getItem('torrgate_client_plugins')!).instances;
          assert.equal(stored[0].secret, 'sample-password!');
          assert.equal(stored[0].accessToken, 'sample-access-token');
        } else {
          await environment.perform(() => environment.form.requestSubmit());
          const stored = JSON.parse(environment.document.defaultView!.localStorage.getItem('torrgate_client_plugins')!).instances;
          assert.equal(stored[0].secret, 'sample-password!');
        }
      } finally {
        environment.close();
      }
    });
  }

  it('blocks missing or malformed API keys and accepts a valid key', async () => {
    const environment = createFormEnvironment();
    try {
      environment.select('plugin-instance-plugin', 'qbittorrent');
      environment.input('plugin-instance-name').value = 'Downloads';
      environment.input('plugin-instance-url').value = 'https://qbit.example';
      const secret = environment.input('plugin-instance-secret');
      for (const key of ['', 'sample-password!', 'qbt_' + 'a'.repeat(27), 'qbt_' + '!'.repeat(28)]) {
        secret.value = key;
        assert.equal(secret.checkValidity(), false);
        assert.equal(environment.form.checkValidity(), false);
        environment.click('btn-plugin-test');
        environment.form.requestSubmit();
        assert.equal(environment.requests.length, 0);
        assert.equal(environment.document.defaultView!.localStorage.getItem('torrgate_client_plugins'), null);
      }
      secret.value = SAMPLE_API_KEY;
      assert.equal(environment.form.checkValidity(), true);
      await environment.perform(() => environment.click('btn-plugin-test'));
      assert.equal(environment.document.getElementById('plugin-connection-status')?.textContent, 'Connection successful');
      await environment.perform(() => environment.form.requestSubmit());
      const stored = JSON.parse(environment.document.defaultView!.localStorage.getItem('torrgate_client_plugins')!).instances;
      assert.equal(stored[0].secret, SAMPLE_API_KEY);
    } finally {
      environment.close();
    }
  });
});
