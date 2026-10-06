// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { CLIENT_PLUGINS_SCRIPT } from '../../src/api/views/client-plugins-script.js';
import { PLUGIN_SETTINGS_SCRIPT } from '../../src/api/views/plugin-settings-script.js';
import { TORRPLAY_PLUGIN_SCRIPT } from '../../src/api/views/torrplay-plugin-script.js';
import { renderWebClientPage } from '../../src/api/views/web-client.js';
import { browserStorageCoordinator } from '../fixtures/browser-storage.js';

type TestListener = (this: TestElement, event: { preventDefault(): void }) => Promise<void> | void;

class TestElement {
  checked = false;
  readonly children: TestElement[] = [];
  className = '';
  readonly dataset: Record<string, string> = {};
  defaultChecked = false;
  defaultValue = '';
  disabled = false;
  hidden = false;
  readonly listeners = new Map<string, TestListener>();
  placeholder = '';
  required = false;
  reset = () => {};
  textContent = '';
  type = '';
  value = '';

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: TestListener) {
    this.listeners.set(type, listener);
  }

  appendChild(child: TestElement) {
    this.children.push(child);
    if (this.tagName === 'select' && !this.value) this.value = child.value;
  }

  async dispatch(type: string) {
    await this.listeners.get(type)?.call(this, { preventDefault: () => {} });
  }

  focus() {}

  querySelectorAll(selector: string): TestElement[] {
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]);
    return descendants.filter(child => selector === '[data-option-id]' && child.dataset.optionId);
  }

  replaceChildren() {
    this.children.length = 0;
    this.textContent = '';
    if (this.tagName === 'select') this.value = '';
  }

  reportValidity() {
    return true;
  }
}

interface TestItem {
  MagnetUri?: string;
  Title: string;
}

interface TestInstance {
  authType: string;
  baseUrl: string;
  enabled: boolean;
  id: string;
  name: string;
  options: Record<string, string>;
}

interface TestPluginManager {
  getInstances(): TestInstance[];
  hasCredentials(id: string): boolean;
  setEnabled(id: string, isEnabled: boolean): Promise<boolean>;
}

interface TestPluginUi {
  handleAction(button: TestElement, item: TestItem): void;
  initialize(context: {
    closeModal(modal: TestElement): void;
    escapeHtml(value: string): string;
    openModal(modal: TestElement): void;
    refreshActions(): void;
    resolveMagnet(item: TestItem): Promise<string | null>;
    showToast(message: string): void;
  }): void;
  renderActions(item: TestItem, index: number): string;
}

function createSettingsEnvironment(options: { fetch?: () => Promise<Response>; origin?: string } = {}) {
  const elements = new Map<string, TestElement>();
  const html = renderWebClientPage({ hasAuth: false });
  for (const match of html.matchAll(/<(\w+)\b([^>]*?)\sid="([^"]+)"([^>]*)>/g)) {
    const element = new TestElement(match[1]);
    element.defaultChecked = /\bchecked\b/.test(match[2] + match[4]);
    elements.set(match[3], element);
  }
  const element = (id: string) => {
    const result = elements.get(id);
    assert.ok(result, id);
    return result;
  };
  const auth = element('plugin-instance-auth');
  for (const value of ['none', 'basic', 'bearer']) {
    const option = new TestElement('option');
    option.value = value;
    auth.appendChild(option);
  }
  element('plugin-instance-form').reset = () => {
    for (const input of elements.values()) {
      if (input.tagName === 'select') input.value = input.children[0]?.value ?? '';
      else input.value = input.defaultValue;
      input.checked = input.defaultChecked;
    }
  };
  const storage = new Map<string, string>();
  const requests: { init: RequestInit; url: string }[] = [];
  const messages: string[] = [];
  const opened: TestElement[] = [];
  const closed: TestElement[] = [];
  let refreshCount = 0;
  let resolvedCount = 0;
  let storageListener: ((event: { key: string | null }) => void) | undefined;
  const window = {
    addEventListener: (_type: string, listener: (event: { key: string | null }) => void) => { storageListener = listener; },
    location: { origin: options.origin ?? 'https://gate.example' },
    torrGatePluginUi: undefined as TestPluginUi | undefined,
    torrGatePlugins: undefined as TestPluginManager | undefined,
  };
  runInNewContext(CLIENT_PLUGINS_SCRIPT + TORRPLAY_PLUGIN_SCRIPT + PLUGIN_SETTINGS_SCRIPT, {
    AbortSignal,
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    crypto: { getRandomValues: crypto.getRandomValues.bind(crypto) },
    document: {
      createElement: (tag: string) => new TestElement(tag),
      createTextNode: (text: string) => {
        const node = new TestElement('#text');
        node.textContent = text;
        return node;
      },
      getElementById: element,
    },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ init, url });
      if (options.fetch) return options.fetch();
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'sample-access-token', expires_in: 3600, token_type: 'Bearer' });
      return Response.json(init.method === 'POST' ? { hash: '0123456789012345678901234567890123456789' } : { torrents: [] });
    },
    indexedDB: browserStorageCoordinator(storage),
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    window,
  });
  assert.ok(window.torrGatePluginUi);
  assert.ok(window.torrGatePlugins);
  const ui = window.torrGatePluginUi;
  const manager = window.torrGatePlugins;
  ui.initialize({
    closeModal: modal => { closed.push(modal); },
    escapeHtml: value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    openModal: modal => { opened.push(modal); },
    refreshActions: () => { refreshCount++; },
    resolveMagnet: async item => {
      resolvedCount++;
      return item.MagnetUri ?? null;
    },
    showToast: message => { messages.push(message); },
  });
  return { closed, dispatchStorage: () => storageListener?.({ key: 'torrgate_client_plugins' }), element, manager, messages, opened, refreshCount: () => refreshCount, requests, resolvedCount: () => resolvedCount, storage, ui };
}

const SAMPLE_ITEM = { MagnetUri: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789', Title: 'Example Release' };

async function addInstance(environment: ReturnType<typeof createSettingsEnvironment>, name: string, baseUrl: string) {
  environment.element('plugin-instance-name').value = name;
  environment.element('plugin-instance-url').value = baseUrl;
  await environment.element('plugin-instance-form').dispatch('submit');
}

function actionButton() {
  const button = new TestElement('button');
  button.dataset.pluginId = 'torrplay';
  button.textContent = 'Send to TorrPlay';
  return button;
}

describe('Plugin settings and result actions', () => {
  it('renders configuration fields and persists enablement and named instances through the form', async () => {
    const environment = createSettingsEnvironment();
    await environment.element('btn-open-plugins').dispatch('click');
    assert.equal(environment.opened[0], environment.element('modal-plugins'));
    assert.equal(environment.closed[0], environment.element('modal-details'));
    const checkbox = environment.element('plugin-toggles').children[0].children[0];
    checkbox.checked = true;
    await checkbox.dispatch('change');
    assert.equal(environment.manager.getInstances().length, 0);
    await addInstance(environment, '<Example server>', 'https://play.example');
    assert.equal(environment.manager.getInstances()[0].name, '<Example server>');
    assert.equal(environment.element('plugin-instance-list').children[0].children[0].textContent, '<Example server> · https://play.example');
    assert.equal(environment.element('plugin-instance-options').querySelectorAll('[data-option-id]').find(select => select.dataset.optionId === 'storage')?.value, 'memory');
    assert.equal(environment.refreshCount(), 2);
    assert.ok(environment.storage.get('torrgate_client_plugins'));
  });

  it('saves the configured local-network location through the form', async () => {
    const environment = createSettingsEnvironment();
    const select = environment.element('plugin-instance-options').querySelectorAll('[data-option-id]').find(input => input.dataset.optionId === 'addressSpace');
    assert.ok(select);
    assert.equal(select.value, 'auto');
    select.value = 'local';
    await addInstance(environment, 'Home', 'http://internal.example:8090');
    const instance = environment.manager.getInstances()[0];
    assert.equal(instance.options.addressSpace, 'local');
    await environment.element('plugin-instance-list').children[0].children[1].dispatch('click');
    assert.equal(environment.element('plugin-instance-options').querySelectorAll('[data-option-id]').find(input => input.dataset.optionId === 'addressSpace')?.value, 'local');
  });

  it('saves and tests instances on an HTTP gateway without randomUUID', async () => {
    const environment = createSettingsEnvironment({ origin: 'http://gateway.example:3000' });
    await addInstance(environment, 'Home', 'http://play.example');
    await addInstance(environment, 'Second', 'http://second.example');
    const instances = environment.manager.getInstances();
    assert.notEqual(instances[0].id, instances[1].id);
    await environment.element('plugin-instance-list').children[0].children[1].dispatch('click');
    await environment.element('btn-plugin-test').dispatch('click');
    assert.equal(environment.element('plugin-connection-status').textContent, 'Connection successful');
  });

  it('renders actions only for enabled plugins and results with obtainable magnets', async () => {
    const { manager, ui } = createSettingsEnvironment();
    assert.equal(ui.renderActions(SAMPLE_ITEM, 0), '');
    await manager.setEnabled('torrplay', true);
    assert.match(ui.renderActions(SAMPLE_ITEM, 3), /data-index="3"/);
    assert.match(ui.renderActions(SAMPLE_ITEM, 3), /Send to TorrPlay/);
    assert.equal(ui.renderActions({ Title: 'Example Release' }, 0), '');
  });

  it('opens settings when no enabled instance is configured', async () => {
    const environment = createSettingsEnvironment();
    await environment.manager.setEnabled('torrplay', true);
    environment.ui.handleAction(actionButton(), SAMPLE_ITEM);
    assert.equal(environment.opened[0], environment.element('modal-plugins'));
    assert.equal(environment.closed[0], environment.element('modal-details'));
    assert.match(environment.messages[0], /Add and enable an instance/);
    assert.equal(environment.requests.length, 0);
  });

  it('sends directly to a single instance and restores button state', async () => {
    const environment = createSettingsEnvironment();
    await environment.manager.setEnabled('torrplay', true);
    await addInstance(environment, 'Home', 'https://home.example');
    const button = actionButton();
    environment.ui.handleAction(button, SAMPLE_ITEM);
    assert.equal(button.disabled, true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(environment.requests[0].url, 'https://home.example/api/v1/torrents');
    assert.equal(environment.resolvedCount(), 1);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Send to TorrPlay');
    assert.ok(environment.messages.includes('Sent to Home'));
  });

  it('lets the user select among enabled instances before sending', async () => {
    const environment = createSettingsEnvironment();
    await environment.manager.setEnabled('torrplay', true);
    await addInstance(environment, 'Home', 'https://home.example');
    await addInstance(environment, 'Living room', 'https://room.example');
    environment.ui.handleAction(actionButton(), SAMPLE_ITEM);
    assert.equal(environment.requests.length, 0);
    assert.equal(environment.opened[0], environment.element('modal-plugin-targets'));
    const select = environment.element('plugin-target-select');
    assert.equal(select.children.length, 2);
    select.value = select.children[1].value;
    await environment.element('btn-plugin-send').dispatch('click');
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(environment.requests[0].url, 'https://room.example/api/v1/torrents');
    assert.equal(environment.closed[0], environment.element('modal-details'));
    assert.equal(environment.closed[1], environment.element('modal-plugin-targets'));
  });

  it('edits and removes instances using the settings list', async () => {
    const environment = createSettingsEnvironment();
    await addInstance(environment, 'Home', 'https://home.example');
    const row = environment.element('plugin-instance-list').children[0];
    await row.children[1].dispatch('click');
    assert.equal(environment.element('plugin-instance-name').value, 'Home');
    await addInstance(environment, 'Renamed', 'https://renamed.example');
    assert.equal(environment.manager.getInstances().length, 1);
    assert.equal(environment.manager.getInstances()[0].name, 'Renamed');
    await environment.element('plugin-instance-list').children[0].children[2].dispatch('click');
    assert.equal(environment.manager.getInstances().length, 0);
  });

  it('updates settings and resets an edit when another tab removes the instance', async () => {
    const environment = createSettingsEnvironment();
    await addInstance(environment, 'Home', 'https://home.example');
    await environment.element('plugin-instance-list').children[0].children[1].dispatch('click');
    const stored = JSON.parse(environment.storage.get('torrgate_client_plugins') ?? '{}');
    stored.instances = [];
    environment.storage.set('torrgate_client_plugins', JSON.stringify(stored));
    environment.dispatchStorage();
    assert.equal(environment.element('plugin-form-title').textContent, 'Add instance');
    assert.equal(environment.element('plugin-instance-name').value, '');
    assert.match(environment.element('plugin-instance-list').textContent, /No instances configured/);
    assert.equal(environment.refreshCount(), 2);
  });

  it('tests a draft connection without saving or sending a magnet', async () => {
    const environment = createSettingsEnvironment();
    environment.element('plugin-instance-name').value = 'Home';
    environment.element('plugin-instance-url').value = 'https://home.example';
    await environment.element('btn-plugin-test').dispatch('click');
    assert.equal(environment.requests[0].init.method, 'GET');
    assert.equal(environment.requests[0].url, 'https://home.example/api/v1/torrents?limit=1');
    assert.equal(environment.manager.getInstances().length, 0);
    assert.equal(environment.resolvedCount(), 0);
    assert.ok(environment.messages.includes('Connection successful'));
    assert.equal(environment.element('plugin-connection-status').textContent, 'Connection successful');
    assert.equal(environment.element('plugin-gateway-origin').textContent, 'https://gate.example');
  });

  it('opens the selected instance for missing credentials and clears the secret input on save', async () => {
    const environment = createSettingsEnvironment();
    await environment.manager.setEnabled('torrplay', true);
    environment.element('plugin-instance-auth').value = 'bearer';
    await environment.element('plugin-instance-auth').dispatch('change');
    assert.equal(environment.element('plugin-secret-field').hidden, false);
    assert.equal(environment.element('plugin-secret-label').textContent, 'Password');
    environment.element('plugin-instance-username').value = 'sample-user';
    await addInstance(environment, 'Home', 'https://home.example');
    environment.ui.handleAction(actionButton(), SAMPLE_ITEM);
    assert.equal(environment.requests.length, 0);
    assert.equal(environment.opened[0], environment.element('modal-plugins'));
    assert.equal(environment.closed[0], environment.element('modal-details'));
    assert.equal(environment.element('plugin-instance-auth').value, 'bearer');
    environment.element('plugin-instance-secret').value = 'sample-token';
    await environment.element('plugin-instance-form').dispatch('submit');
    assert.equal(environment.element('plugin-instance-secret').value, '');
    assert.equal(environment.manager.hasCredentials(environment.manager.getInstances()[0].id), true);
    assert.equal(JSON.parse(environment.storage.get('torrgate_client_plugins') ?? '{}').instances[0].secret, 'sample-token');
  });

  it('restores button state and reports failed sends', async () => {
    const environment = createSettingsEnvironment({ fetch: async () => new Response(null, { status: 401 }) });
    await environment.manager.setEnabled('torrplay', true);
    await addInstance(environment, 'Home', 'https://home.example');
    const button = actionButton();
    environment.ui.handleAction(button, SAMPLE_ITEM);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(button.disabled, false);
    assert.ok(environment.messages.some(message => message.includes('Authentication failed')));
  });

  it('adds separate Bearer instances using Save & get token without replacing the first', async () => {
    const environment = createSettingsEnvironment();
    for (const name of ['Home', 'Second']) {
      environment.element('plugin-instance-auth').value = 'bearer';
      await environment.element('plugin-instance-auth').dispatch('change');
      environment.element('plugin-instance-name').value = name;
      environment.element('plugin-instance-url').value = 'https://' + name.toLowerCase() + '.example';
      environment.element('plugin-instance-username').value = name.toLowerCase() + '-user';
      environment.element('plugin-instance-secret').value = name.toLowerCase() + '-password';
      await environment.element('btn-plugin-token').dispatch('click');
    }
    const instances = environment.manager.getInstances();
    assert.equal(instances.length, 2);
    assert.notEqual(instances[0].id, instances[1].id);
    assert.equal(environment.element('plugin-instance-list').children.length, 2);
    assert.equal(environment.element('plugin-form-title').textContent, 'Add instance');
    assert.equal(environment.element('plugin-instance-name').value, '');
    const stored = JSON.parse(environment.storage.get('torrgate_client_plugins') ?? '{}').instances;
    assert.equal(stored.length, 2);
    for (const name of ['Home', 'Second']) {
      const instance = stored.find((entry: { name: string }) => entry.name === name);
      assert.ok(instance);
      assert.equal(instance.secret, name.toLowerCase() + '-password');
      assert.equal(instance.accessToken, 'sample-access-token');
    }
  });

  it('saves Bearer account credentials and acquires a token through the form action', async () => {
    const environment = createSettingsEnvironment();
    environment.element('plugin-instance-auth').value = 'bearer';
    await environment.element('plugin-instance-auth').dispatch('change');
    assert.equal(environment.element('plugin-username-field').hidden, false);
    assert.equal(environment.element('btn-plugin-token').hidden, false);
    environment.element('plugin-instance-name').value = 'Home';
    environment.element('plugin-instance-url').value = 'https://home.example';
    environment.element('plugin-instance-username').value = 'sample-user';
    environment.element('plugin-instance-secret').value = 'sample-password';
    await environment.element('btn-plugin-token').dispatch('click');
    assert.equal(environment.requests[0].url, 'https://home.example/oauth/token');
    const stored = JSON.parse(environment.storage.get('torrgate_client_plugins') ?? '{}').instances[0];
    assert.equal(stored.username, 'sample-user');
    assert.equal(stored.secret, 'sample-password');
    assert.equal(stored.accessToken, 'sample-access-token');
    assert.match(environment.element('plugin-connection-status').textContent, /renew automatically/);
    assert.equal(environment.element('plugin-instance-secret').value, '');
    assert.equal(environment.element('btn-plugin-token').disabled, false);
  });
});
