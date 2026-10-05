// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { CLIENT_PLUGINS_SCRIPT } from '../../src/api/views/client-plugins-script.js';
import { TORRPLAY_PLUGIN_SCRIPT } from '../../src/api/views/torrplay-plugin-script.js';
import { browserStorageCoordinator } from '../fixtures/browser-storage.js';

interface Instance {
  authType: string;
  baseUrl: string;
  enabled: boolean;
  id: string;
  name: string;
  options: Record<string, string>;
  pluginId: string;
  username: string;
}

interface Item {
  Link?: string;
  MagnetUri?: string;
  Title: string;
}

interface PluginManager {
  authorize(id: string): Promise<void>;
  createInstanceId(): string;
  getInstances(pluginId?: string): Instance[];
  getPlugins(): { canHandle(item: Item): boolean; id: string }[];
  getTargets(pluginId: string): Instance[];
  hasCredentials(id: string): boolean;
  isEnabled(pluginId: string): boolean;
  removeInstance(id: string): Promise<boolean>;
  send(id: string, item: Item, resolveMagnet: (item: Item) => Promise<string | null>): Promise<{ status: string }>;
  setCredentials(id: string, secret: string): Promise<boolean>;
  setEnabled(pluginId: string, isEnabled: boolean): Promise<boolean>;
  subscribe(listener: () => void): () => boolean;
  test(instance: Instance, secret?: string): Promise<{ status: string }>;
  upsertInstance(instance: Instance, secret?: string): Promise<boolean>;
}

const STORAGE_KEY = 'torrgate_client_plugins';
const SAMPLE_MAGNET = 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789&dn=Тестовый%20Релиз&tr=https%3A%2F%2Ftracker.example%2Fannounce';

function sampleInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    authType: 'none',
    baseUrl: 'https://play.example/proxy/',
    enabled: true,
    id: 'home',
    name: 'Home',
    options: { storage: 'memory' },
    pluginId: 'torrplay',
    username: '',
    ...overrides,
  };
}

function createPluginEnvironment(options: {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  isCoordinationUnavailable?: boolean;
  isStorageUnavailable?: boolean;
  now?: () => number;
  pluginScript?: string;
  readStorage?: () => void;
  storage?: Map<string, string>;
} = {}) {
  const storage = options.storage ?? new Map<string, string>();
  const requests: { init: RequestInit; url: string }[] = [];
  let storageListener: ((event: { key: string | null }) => void) | undefined;
  const timeouts: number[] = [];
  const window = {
    addEventListener: (_type: string, listener: (event: { key: string | null }) => void) => { storageListener = listener; },
    location: { origin: 'https://gate.example' },
    torrGatePlugins: undefined as PluginManager | undefined,
  };
  const testFetch = async (url: string, init: RequestInit): Promise<Response> => {
    requests.push({ init, url });
    if (options.fetch) return options.fetch(url, init);
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'sample-access-token', expires_in: 3600, token_type: 'Bearer' });
    return Response.json(init.method === 'POST' ? { hash: '0123456789012345678901234567890123456789' } : { torrents: [] });
  };
  runInNewContext(CLIENT_PLUGINS_SCRIPT + TORRPLAY_PLUGIN_SCRIPT + (options.pluginScript ?? ''), {
    AbortSignal: { timeout: (timeoutMs: number) => { timeouts.push(timeoutMs); return AbortSignal.timeout(timeoutMs); } },
    Date: { now: options.now ?? Date.now },
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    crypto: { getRandomValues: crypto.getRandomValues.bind(crypto) },
    fetch: testFetch,
    indexedDB: options.isCoordinationUnavailable ? undefined : browserStorageCoordinator(storage),
    localStorage: {
      getItem: (key: string) => {
        const value = storage.get(key) ?? null;
        options.readStorage?.();
        return value;
      },
      setItem: (key: string, value: string) => {
        if (options.isStorageUnavailable) throw new Error('Storage unavailable');
        storage.set(key, value);
      },
    },
    window,
  });
  assert.ok(window.torrGatePlugins);
  return { dispatchStorage: (key: string | null = STORAGE_KEY) => storageListener?.({ key }), manager: window.torrGatePlugins, requests, storage, timeouts };
}

async function enableInstance(manager: PluginManager, instance = sampleInstance(), secret?: string) {
  await manager.setEnabled('torrplay', true);
  await manager.upsertInstance(instance, secret);
}

describe('Client plugins and TorrPlay adapter', () => {
  it('registers another integration with independent configuration and actions', async () => {
    const { manager, requests } = createPluginEnvironment({ pluginScript: String.raw`
      window.torrGatePlugins.register({
        actionLabel: 'Send to Sample Player',
        canHandle: () => true,
        fields: [{ choices: [{ label: 'Queue', value: 'queue' }], defaultValue: 'queue', id: 'mode', label: 'Mode' }],
        id: 'sample-player',
        name: 'Sample Player',
        send: (instance, item, magnet, request) => request(instance, 'queue', { body: JSON.stringify({ magnet, mode: instance.options.mode }), method: 'POST' }),
        test: (instance, request) => request(instance, 'status'),
      });
    ` });
    await manager.upsertInstance(sampleInstance({ id: 'sample', options: { mode: 'queue' }, pluginId: 'sample-player' }));
    await manager.setEnabled('sample-player', true);
    await manager.send('sample', { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' }, async () => SAMPLE_MAGNET);
    assert.equal(manager.getPlugins().length, 2);
    assert.equal(manager.getTargets('torrplay').length, 0);
    assert.equal(requests[0].url, 'https://play.example/proxy/queue');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), { magnet: SAMPLE_MAGNET, mode: 'queue' });
  });

  it('keeps plugin enablement separate from named instances and their enablement', async () => {
    const { manager, storage } = createPluginEnvironment();
    await manager.upsertInstance(sampleInstance());
    await manager.upsertInstance(sampleInstance({ enabled: false, id: 'living-room', name: 'Living room' }));
    assert.equal(manager.getTargets('torrplay').length, 0);
    await manager.setEnabled('torrplay', true);
    assert.equal(manager.getTargets('torrplay')[0].name, 'Home');
    const restored = createPluginEnvironment({ storage }).manager;
    assert.equal(restored.getInstances().length, 2);
    assert.equal(restored.getTargets('torrplay').length, 1);
    await restored.setEnabled('torrplay', false);
    assert.equal(restored.getTargets('torrplay').length, 0);
    assert.equal(restored.getInstances().length, 2);
  });

  it('sends the full Unicode magnet and title to the selected instance using its storage preference', async () => {
    const { manager, requests } = createPluginEnvironment();
    await enableInstance(manager);
    await manager.upsertInstance(sampleInstance({ baseUrl: 'https://second.example', id: 'second', options: { storage: 'file' } }));
    const result = await manager.send('second', { MagnetUri: SAMPLE_MAGNET, Title: 'Тестовый Релиз' }, async item => item.MagnetUri ?? null);
    assert.equal(result.status, 'success');
    assert.equal(requests[0].url, 'https://second.example/api/v1/torrents');
    assert.equal(requests[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), { magnet: SAMPLE_MAGNET, storage: 'file', title: 'Тестовый Релиз' });
    assert.equal(requests[0].init.credentials, 'omit');
    assert.equal(requests[0].init.redirect, 'error');
    assert.ok(requests[0].init.signal);
  });

  it('uses the shared magnet resolver for download-only results', async () => {
    const { manager, requests } = createPluginEnvironment();
    await enableInstance(manager);
    const item = { Link: '/api/v2.0/indexers/rutor/download?url=https%3A%2F%2Ftracker.example%2F1', Title: 'Example Release' };
    let resolvedItem: Item | undefined;
    await manager.send('home', item, async item => {
      resolvedItem = item;
      return SAMPLE_MAGNET;
    });
    assert.equal(resolvedItem, item);
    assert.equal(JSON.parse(String(requests[0].init.body)).magnet, SAMPLE_MAGNET);
  });

  it('only offers download fallback for canonical same-origin download URLs', async () => {
    const { manager } = createPluginEnvironment();
    const plugin = manager.getPlugins()[0];
    assert.equal(plugin.canHandle({ Title: 'Example Release' }), false);
    assert.equal(plugin.canHandle({ Link: 'https://foreign.example/api/v2.0/indexers/rutor/download', Title: 'Example Release' }), false);
    assert.equal(plugin.canHandle({ Link: '/api/v2.0/indexers/rutor/download', Title: 'Example Release' }), true);
  });

  it('persists Basic credentials and restores UTF-8 authentication after reload', async () => {
    const { manager, requests, storage } = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'basic', username: 'тест' });
    await enableInstance(manager, instance, 'sample-password');
    await manager.test(instance);
    const headers = requests[0].init.headers as Record<string, string>;
    assert.equal(Buffer.from(headers.Authorization.slice(6), 'base64').toString('utf8'), 'тест:sample-password');
    assert.equal(JSON.parse(storage.get(STORAGE_KEY) ?? '{}').instances[0].secret, 'sample-password');
    const restored = createPluginEnvironment({ storage });
    assert.equal(restored.manager.hasCredentials('home'), true);
    await restored.manager.test(instance);
    const restoredHeaders = restored.requests[0].init.headers as Record<string, string>;
    assert.equal(Buffer.from(restoredHeaders.Authorization.slice(6), 'base64').toString('utf8'), 'тест:sample-password');
  });

  it('acquires and persists Bearer tokens and restores them without another sign-in', async () => {
    const { manager, requests, storage } = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'bearer', username: 'sample-user' });
    await enableInstance(manager, instance, 'sample-password');
    await manager.authorize('home');
    assert.equal(requests[0].url, 'https://play.example/proxy/oauth/token');
    const form = new URLSearchParams(String(requests[0].init.body));
    assert.equal(form.get('grant_type'), 'password');
    assert.equal(form.get('username'), 'sample-user');
    assert.equal(form.get('password'), 'sample-password');
    assert.equal((requests[0].init.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal((requests[0].init.headers as Record<string, string>).Authorization, undefined);
    const stored = JSON.parse(storage.get(STORAGE_KEY) ?? '{}').instances[0];
    assert.equal(stored.accessToken, 'sample-access-token');
    assert.ok(stored.expiresAtMs > Date.now());
    const restored = createPluginEnvironment({ storage });
    await restored.manager.send('home', { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' }, async () => SAMPLE_MAGNET);
    assert.equal(restored.requests.length, 1);
    assert.equal((restored.requests[0].init.headers as Record<string, string>).Authorization, 'Bearer sample-access-token');
    await manager.upsertInstance({ ...instance, baseUrl: 'https://other.example' });
    assert.equal(createPluginEnvironment({ storage }).manager.hasCredentials('home'), false);
    assert.equal(JSON.parse(storage.get(STORAGE_KEY) ?? '{}').instances[0].accessToken, '');
  });

  it('never reuses saved credentials when testing a different destination', async () => {
    const { manager, requests } = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'basic', username: 'sample-user' });
    await enableInstance(manager, instance, 'sample-token');
    await assert.rejects(manager.test({ ...instance, baseUrl: 'https://other.example' }), /Enter and save credentials/);
    assert.equal(requests.length, 0);
    assert.equal(manager.hasCredentials('home'), true);
  });

  it('allows torrent additions more time than ordinary API and token requests', async () => {
    const environment = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'bearer', username: 'sample-user' });
    await enableInstance(environment.manager, instance, 'sample-password');
    await environment.manager.authorize('home');
    await environment.manager.send('home', { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' }, async () => SAMPLE_MAGNET);
    await environment.manager.test(sampleInstance());
    assert.deepEqual(environment.timeouts, [15000, 45000, 15000]);
  });

  it('does not restore an instance removed in another tab before its storage event arrives', async () => {
    const first = createPluginEnvironment();
    await enableInstance(first.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    const second = createPluginEnvironment({ storage: first.storage });
    await first.manager.removeInstance('home');
    await assert.rejects(second.manager.authorize('home'), /no longer exists/);
    assert.equal(second.requests.length, 0);
    assert.equal(second.manager.hasCredentials('home'), false);
    assert.equal(JSON.parse(first.storage.get(STORAGE_KEY) ?? '{}').instances.length, 0);
  });

  it('discards an in-flight token after another tab removes the instance', async () => {
    let finishToken: ((response: Response) => void) | undefined;
    const first = createPluginEnvironment();
    await enableInstance(first.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    const second = createPluginEnvironment({ fetch: () => new Promise<Response>(resolve => { finishToken = resolve; }), storage: first.storage });
    const outcome = Promise.allSettled([second.manager.authorize('home')]);
    await new Promise<void>(resolve => setImmediate(resolve));
    await first.manager.removeInstance('home');
    assert.ok(finishToken);
    finishToken(Response.json({ access_token: 'old-token', expires_in: 3600, token_type: 'Bearer' }));
    assert.equal((await outcome)[0].status, 'rejected');
    assert.equal(JSON.parse(first.storage.get(STORAGE_KEY) ?? '{}').instances.length, 0);
    assert.equal(second.manager.hasCredentials('home'), false);
  });

  it('keeps a password changed in another tab when an old token request finishes', async () => {
    let finishToken: ((response: Response) => void) | undefined;
    const first = createPluginEnvironment();
    await enableInstance(first.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'original-password');
    const second = createPluginEnvironment({ fetch: () => new Promise<Response>(resolve => { finishToken = resolve; }), storage: first.storage });
    const outcome = Promise.allSettled([second.manager.authorize('home')]);
    await new Promise<void>(resolve => setImmediate(resolve));
    await first.manager.setCredentials('home', 'updated-password');
    assert.ok(finishToken);
    finishToken(Response.json({ access_token: 'old-token', expires_in: 3600, token_type: 'Bearer' }));
    assert.equal((await outcome)[0].status, 'rejected');
    const stored = JSON.parse(first.storage.get(STORAGE_KEY) ?? '{}').instances[0];
    assert.equal(stored.secret, 'updated-password');
    assert.equal(stored.accessToken, '');
  });

  for (const change of ['remove', 'password'] as const) {
    it('serializes a concurrent ' + change + ' between the token storage read and write', async () => {
      const first = createPluginEnvironment();
      await enableInstance(first.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'original-password');
      let shouldChange = false;
      let changed: Promise<boolean> | undefined;
      const second = createPluginEnvironment({
        fetch: async () => {
          shouldChange = true;
          return Response.json({ access_token: 'old-token', expires_in: 3600, token_type: 'Bearer' });
        },
        readStorage: () => {
          if (!shouldChange) return;
          shouldChange = false;
          changed = change === 'remove' ? first.manager.removeInstance('home') : first.manager.setCredentials('home', 'updated-password');
        },
        storage: first.storage,
      });
      await second.manager.authorize('home');
      assert.ok(changed);
      assert.equal(await changed, true);
      const stored = JSON.parse(first.storage.get(STORAGE_KEY) ?? '{}');
      if (change === 'remove') {
        assert.equal(stored.instances.length, 0);
        assert.equal(second.manager.hasCredentials('home'), false);
      } else {
        assert.equal(stored.instances[0].secret, 'updated-password');
        assert.equal(stored.instances[0].accessToken, '');
      }
    });
  }

  it('merges simultaneous settings updates from different tabs', async () => {
    const first = createPluginEnvironment();
    const second = createPluginEnvironment({ storage: first.storage });
    await Promise.all([
      first.manager.upsertInstance(sampleInstance()),
      second.manager.upsertInstance(sampleInstance({ id: 'second', name: 'Second' })),
    ]);
    assert.deepEqual(Array.from(first.manager.getInstances(), instance => instance.id).sort(), ['home', 'second']);
    assert.equal(second.manager.getInstances().length, 2);
  });

  it('generates independent IDs without the secure-context randomUUID API', async () => {
    const { manager } = createPluginEnvironment();
    const first = manager.createInstanceId();
    assert.match(first, /^[a-f0-9]{32}$/);
    assert.notEqual(first, manager.createInstanceId());
    await manager.test(sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
  });

  it('preserves other tabs changes when saving an unrelated setting', async () => {
    const first = createPluginEnvironment();
    await enableInstance(first.manager);
    const second = createPluginEnvironment({ storage: first.storage });
    await first.manager.upsertInstance(sampleInstance({ id: 'second', name: 'Second' }));
    await second.manager.setEnabled('torrplay', false);
    const restored = createPluginEnvironment({ storage: first.storage });
    assert.equal(restored.manager.getInstances().length, 2);
    assert.equal(restored.manager.isEnabled('torrplay'), false);
  });

  it('updates subscribers on storage events and removes credentials when storage is cleared', async () => {
    const first = createPluginEnvironment();
    await enableInstance(first.manager, sampleInstance({ authType: 'basic', username: 'sample-user' }), 'sample-password');
    const second = createPluginEnvironment({ storage: first.storage });
    let changes = 0;
    second.manager.subscribe(() => { changes++; });
    await first.manager.setEnabled('torrplay', false);
    second.dispatchStorage();
    assert.equal(changes, 1);
    assert.equal(second.manager.isEnabled('torrplay'), false);
    first.storage.clear();
    second.dispatchStorage(null);
    assert.equal(changes, 2);
    assert.equal(second.manager.getInstances().length, 0);
    assert.equal(second.manager.hasCredentials('home'), false);
  });

  it('renews the token before expiry and shares acquisition across concurrent requests', async () => {
    let nowMs = 1000000;
    let tokenCount = 0;
    const environment = createPluginEnvironment({
      fetch: async url => url.endsWith('/oauth/token')
        ? Response.json({ access_token: 'access-' + ++tokenCount, expires_in: 3600, token_type: 'Bearer' })
        : Response.json({ hash: '0123456789012345678901234567890123456789' }),
      now: () => nowMs,
    });
    const instance = sampleInstance({ authType: 'bearer', username: 'sample-user' });
    await enableInstance(environment.manager, instance, 'sample-password');
    await Promise.all([environment.manager.authorize('home'), environment.manager.authorize('home')]);
    assert.equal(tokenCount, 1);
    nowMs += 3539000;
    await environment.manager.authorize('home');
    assert.equal(tokenCount, 1);
    nowMs += 1000;
    const item = { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' };
    await Promise.all([
      environment.manager.send('home', item, async () => SAMPLE_MAGNET),
      environment.manager.send('home', { ...item }, async () => SAMPLE_MAGNET),
    ]);
    assert.equal(tokenCount, 2);
    const sends = environment.requests.filter(request => request.url.endsWith('/api/v1/torrents'));
    assert.equal(sends.length, 2);
    assert.ok(sends.every(request => (request.init.headers as Record<string, string>).Authorization === 'Bearer access-2'));
    assert.equal(JSON.parse(environment.storage.get(STORAGE_KEY) ?? '{}').instances[0].accessToken, 'access-2');
  });

  it('renews an expired token after reload', async () => {
    const environment = createPluginEnvironment({ now: () => 1000000 });
    await enableInstance(environment.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    await environment.manager.authorize('home');
    const restored = createPluginEnvironment({ now: () => 5000000, storage: environment.storage });
    await restored.manager.authorize('home');
    assert.equal(restored.requests[0].url, 'https://play.example/proxy/oauth/token');
  });

  it('uses JWT expiration when the token response omits expires_in', async () => {
    const token = 'header.' + Buffer.from(JSON.stringify({ exp: 5000 })).toString('base64url') + '.signature';
    const environment = createPluginEnvironment({
      fetch: async () => Response.json({ access_token: token, token_type: 'Bearer' }),
      now: () => 1000000,
    });
    await enableInstance(environment.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    await environment.manager.authorize('home');
    assert.equal(JSON.parse(environment.storage.get(STORAGE_KEY) ?? '{}').instances[0].expiresAtMs, 5000000);
  });

  it('rejects invalid token responses and permits a retry after acquisition failure', async () => {
    for (const body of [{}, { access_token: 'invalid', token_type: 'Basic' }, { access_token: 'invalid', token_type: 'Bearer' }]) {
      const environment = createPluginEnvironment({ fetch: async () => Response.json(body) });
      await enableInstance(environment.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
      await assert.rejects(environment.manager.authorize('home'), /invalid token|valid expiration/);
      assert.equal(JSON.parse(environment.storage.get(STORAGE_KEY) ?? '{}').instances[0].accessToken, '');
    }
    let shouldFail = true;
    const environment = createPluginEnvironment({ fetch: async () => shouldFail
      ? new Response(null, { status: 401 })
      : Response.json({ access_token: 'valid-access-token', expires_in: 3600, token_type: 'Bearer' }) });
    await enableInstance(environment.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    await assert.rejects(environment.manager.authorize('home'), /Authentication failed/);
    shouldFail = false;
    await environment.manager.authorize('home');
    assert.equal(environment.requests.length, 2);
  });

  it('discards tokens acquired while instance credentials change', async () => {
    let finishToken: ((response: Response) => void) | undefined;
    const environment = createPluginEnvironment({ fetch: () => new Promise<Response>(resolve => { finishToken = resolve; }) });
    const instance = sampleInstance({ authType: 'bearer', username: 'sample-user' });
    await enableInstance(environment.manager, instance, 'sample-password');
    const results = Promise.allSettled([environment.manager.authorize('home'), environment.manager.authorize('home')]);
    await new Promise<void>(resolve => setImmediate(resolve));
    await environment.manager.upsertInstance({ ...instance, baseUrl: 'https://other.example' });
    assert.ok(finishToken);
    finishToken(Response.json({ access_token: 'old-access-token', expires_in: 3600, token_type: 'Bearer' }));
    const outcomes = await results;
    assert.ok(outcomes.every(outcome => outcome.status === 'rejected'));
    assert.equal(JSON.parse(environment.storage.get(STORAGE_KEY) ?? '{}').instances[0].accessToken, '');
  });

  it('acquires a draft token for connection testing without saving credentials or tokens', async () => {
    const environment = createPluginEnvironment();
    await environment.manager.test(sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'draft-password');
    assert.equal(environment.requests.length, 2);
    assert.equal(environment.requests[0].url, 'https://play.example/proxy/oauth/token');
    assert.equal((environment.requests[1].init.headers as Record<string, string>).Authorization, 'Bearer sample-access-token');
    assert.equal(environment.storage.get(STORAGE_KEY), undefined);
  });

  it('clears a rejected cached token so the next send signs in again', async () => {
    let shouldReject = true;
    let tokenCount = 0;
    const environment = createPluginEnvironment({ fetch: async url => {
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'access-' + ++tokenCount, expires_in: 3600, token_type: 'Bearer' });
      return shouldReject ? new Response(null, { status: 401 }) : Response.json({ hash: '0123456789012345678901234567890123456789' });
    } });
    await enableInstance(environment.manager, sampleInstance({ authType: 'bearer', username: 'sample-user' }), 'sample-password');
    const item = { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' };
    await assert.rejects(environment.manager.send('home', item, async () => SAMPLE_MAGNET), /Authentication failed/);
    assert.equal(JSON.parse(environment.storage.get(STORAGE_KEY) ?? '{}').instances[0].accessToken, '');
    shouldReject = false;
    await environment.manager.send('home', item, async () => SAMPLE_MAGNET);
    assert.equal(tokenCount, 2);
  });

  it('requires account credentials when restoring a previous manually supplied token', async () => {
    const stored = JSON.stringify({ enabledPlugins: ['torrplay'], instances: [{ ...sampleInstance({ authType: 'bearer' }), secret: 'old-manual-token' }], version: 1 });
    const environment = createPluginEnvironment({ storage: new Map([[STORAGE_KEY, stored]]) });
    assert.equal(environment.manager.getInstances().length, 1);
    assert.equal(environment.manager.hasCredentials('home'), false);
  });

  it('tests a draft without saving it or replacing saved credentials', async () => {
    const { manager, requests, storage } = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'basic', username: 'sample-user' });
    await enableInstance(manager, instance, 'saved-token');
    await manager.test(instance, 'draft-token');
    await manager.test(instance);
    assert.equal((requests[0].init.headers as Record<string, string>).Authorization, 'Basic ' + Buffer.from('sample-user:draft-token').toString('base64'));
    assert.equal((requests[1].init.headers as Record<string, string>).Authorization, 'Basic ' + Buffer.from('sample-user:saved-token').toString('base64'));
    assert.equal(manager.getInstances().length, 1);
    assert.ok(!storage.get(STORAGE_KEY)?.includes('draft-token'));
    const restored = createPluginEnvironment({ storage });
    await restored.manager.test(instance);
    assert.equal((restored.requests[0].init.headers as Record<string, string>).Authorization, 'Basic ' + Buffer.from('sample-user:saved-token').toString('base64'));
  });

  it('validates URLs, authentication and plugin settings before saving', async () => {
    const { manager } = createPluginEnvironment();
    for (const baseUrl of ['javascript:alert(1)', 'file:///tmp/server', 'https://user:password@play.example', 'https://play.example?token=secret', 'https://play.example#fragment', 'invalid']) {
      await assert.rejects(manager.upsertInstance(sampleInstance({ baseUrl })));
    }
    await assert.rejects(manager.upsertInstance(sampleInstance({ options: { storage: 'invalid' } })), /Invalid/);
    await assert.rejects(manager.upsertInstance(sampleInstance({ authType: 'basic', username: 'user:name' })), /username/);
    await assert.rejects(manager.upsertInstance(sampleInstance({ authType: 'invalid' })), /authentication/);
    assert.equal(manager.getInstances().length, 0);
  });

  it('recovers from corrupt, unsupported, and partially invalid saved settings', async () => {
    for (const value of ['invalid', JSON.stringify({ version: 2 }), JSON.stringify({ enabledPlugins: [], instances: [null, sampleInstance({ baseUrl: 'javascript:alert(1)' }), sampleInstance()], version: 1 })]) {
      const { manager } = createPluginEnvironment({ storage: new Map([[STORAGE_KEY, value]]) });
      assert.ok(manager.getInstances().length <= 1);
    }
  });

  it('keeps settings usable in memory when browser storage is unavailable', async () => {
    const { manager } = createPluginEnvironment({ isStorageUnavailable: true });
    assert.equal(await manager.upsertInstance(sampleInstance()), false);
    assert.equal(manager.getInstances().length, 1);
    assert.equal(await manager.setEnabled('torrplay', true), false);
    assert.equal(manager.getTargets('torrplay').length, 1);
  });

  it('keeps coordination failures in memory without writing shared storage', async () => {
    const saved = createPluginEnvironment();
    await enableInstance(saved.manager, sampleInstance());
    const original = saved.storage.get(STORAGE_KEY);
    const { manager } = createPluginEnvironment({ isCoordinationUnavailable: true, storage: saved.storage });
    assert.equal(await manager.upsertInstance(sampleInstance({ id: 'session', name: 'Session' })), false);
    assert.equal(await manager.setEnabled('torrplay', false), false);
    assert.equal(manager.getInstances().length, 2);
    assert.equal(manager.isEnabled('torrplay'), false);
    assert.equal(saved.storage.get(STORAGE_KEY), original);
  });

  it('removes an instance and its credentials', async () => {
    const { manager, storage } = createPluginEnvironment();
    await enableInstance(manager, sampleInstance({ authType: 'basic', username: 'sample-user' }), 'sample-token');
    await manager.removeInstance('home');
    assert.equal(manager.getInstances().length, 0);
    assert.equal(manager.hasCredentials('home'), false);
    assert.equal(createPluginEnvironment({ storage }).manager.hasCredentials('home'), false);
    assert.ok(!storage.get(STORAGE_KEY)?.includes('sample-token'));
  });

  it('persists credential updates and explicit clearing', async () => {
    const { manager, storage } = createPluginEnvironment();
    await enableInstance(manager, sampleInstance({ authType: 'basic', username: 'sample-user' }), 'original-token');
    assert.equal(await manager.setCredentials('home', 'updated-token'), true);
    assert.equal(JSON.parse(storage.get(STORAGE_KEY) ?? '{}').instances[0].secret, 'updated-token');
    assert.equal(await manager.setCredentials('home', ''), true);
    assert.equal(createPluginEnvironment({ storage }).manager.hasCredentials('home'), false);
  });

  it('preserves credentials on ordinary edits and clears them when authentication is disabled', async () => {
    const { manager, storage } = createPluginEnvironment();
    const instance = sampleInstance({ authType: 'basic', username: 'sample-user' });
    await enableInstance(manager, instance, 'sample-token');
    await manager.upsertInstance({ ...instance, name: 'Renamed' });
    assert.equal(createPluginEnvironment({ storage }).manager.hasCredentials('home'), true);
    await manager.upsertInstance({ ...instance, authType: 'none' });
    assert.equal(createPluginEnvironment({ storage }).manager.hasCredentials('home'), false);
    assert.ok(!storage.get(STORAGE_KEY)?.includes('sample-token'));
  });

  it('reports already-added torrents separately from successful additions', async () => {
    const { manager } = createPluginEnvironment({ fetch: async () => new Response(null, { status: 409 }) });
    await enableInstance(manager);
    assert.equal((await manager.send('home', { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' }, async () => SAMPLE_MAGNET)).status, 'exists');
  });

  it('reports authentication, HTTP, network, and timeout failures', async () => {
    const cases = [
      { fetch: async () => new Response(null, { status: 401 }), message: /Authentication failed/ },
      { fetch: async () => new Response(null, { status: 403 }), message: /Authentication failed/ },
      { fetch: async () => new Response(null, { status: 503 }), message: /HTTP 503/ },
      { fetch: async () => { throw new TypeError('Failed to fetch'); }, message: /CORS/ },
      { fetch: async () => { throw new DOMException('Timeout', 'TimeoutError'); }, message: /timed out/ },
    ];
    for (const sample of cases) {
      const { manager } = createPluginEnvironment({ fetch: sample.fetch });
      await assert.rejects(manager.test(sampleInstance()), sample.message);
    }
  });

  it('rejects successful responses from an unrelated web server', async () => {
    const { manager } = createPluginEnvironment({ fetch: async () => new Response('<html>Example</html>') });
    await assert.rejects(manager.test(sampleInstance()), /did not return a TorrPlay/);
    await enableInstance(manager);
    await assert.rejects(manager.send('home', { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' }, async () => SAMPLE_MAGNET), /unexpected torrent response/);
  });

  it('prevents duplicate in-flight sends and permits retry after failure', async () => {
    let finishResolution: ((magnet: string) => void) | undefined;
    const { manager, requests } = createPluginEnvironment();
    await enableInstance(manager);
    const item = { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' };
    const first = manager.send('home', item, () => new Promise<string>(resolve => { finishResolution = resolve; }));
    assert.equal((await manager.send('home', item, async () => SAMPLE_MAGNET)).status, 'pending');
    assert.ok(finishResolution);
    finishResolution(SAMPLE_MAGNET);
    await first;
    assert.equal(requests.length, 1);
    await assert.rejects(manager.send('home', item, async () => { throw new Error('Cannot resolve magnet'); }), /Cannot resolve/);
    await manager.send('home', item, async () => SAMPLE_MAGNET);
    assert.equal(requests.length, 2);
  });

  it('rejects disabled instances and invalid or unavailable magnets', async () => {
    const { manager, requests } = createPluginEnvironment();
    await enableInstance(manager);
    const item = { MagnetUri: SAMPLE_MAGNET, Title: 'Example Release' };
    await assert.rejects(manager.send('home', item, async () => null), /No valid magnet/);
    await assert.rejects(manager.send('home', item, async () => 'javascript:alert(1)'), /No valid magnet/);
    await manager.upsertInstance(sampleInstance({ enabled: false }));
    await assert.rejects(manager.send('home', item, async () => SAMPLE_MAGNET), /Enable/);
    await manager.upsertInstance(sampleInstance());
    await manager.setEnabled('torrplay', false);
    await assert.rejects(manager.send('home', item, async () => SAMPLE_MAGNET), /Enable/);
    assert.equal(requests.length, 0);
  });
});
