// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const CLIENT_PLUGINS_SCRIPT = String.raw`
  (function() {
    const STORAGE_KEY = 'torrgate_client_plugins';
    const plugins = new Map();
    const credentials = new Map();
    const accessTokens = new Map();
    const tokenRequests = new Map();
    const pending = new Map();
    const listeners = new Set();
    let databasePromise;
    let canPersist = true;
    let lastStoredValue = null;
    let settings = { enabledPlugins: [], instances: [], version: 1 };
    try {
      lastStoredValue = localStorage.getItem(STORAGE_KEY);
      const stored = JSON.parse(lastStoredValue);
      if (stored && stored.version === 1 && Array.isArray(stored.enabledPlugins) && Array.isArray(stored.instances)) {
        settings = { enabledPlugins: stored.enabledPlugins.filter(id => typeof id === 'string'), instances: stored.instances.filter(instance => instance && typeof instance === 'object'), version: 1 };
      }
    } catch {}

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY || event.key === null) synchronizeStorage();
    });

    function createInstanceId() {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function normalizeUrl(value) {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Use an HTTP or HTTPS base URL without credentials, a query, or a fragment');
      }
      return url.href.replace(/\/+$/, '');
    }

    function normalizeInstance(instance, isRestoring = false) {
      const plugin = plugins.get(instance.pluginId);
      if (!plugin || typeof instance.id !== 'string' || !instance.id || typeof instance.name !== 'string' || !instance.name.trim()) {
        throw new Error('Choose a plugin and enter an instance name');
      }
      if (!['none', 'basic', 'bearer'].includes(instance.authType)) throw new Error('Choose a supported authentication method');
      const username = typeof instance.username === 'string' ? instance.username.trim() : '';
      if (instance.authType === 'basic' && (!username || username.includes(':'))) {
        throw new Error('Basic authentication needs a username without a colon');
      }
      if (instance.authType === 'bearer' && ((!username && !isRestoring) || typeof plugin.getToken !== 'function')) throw new Error('Bearer sign-in needs a username and a plugin that supports token acquisition');
      const options = {};
      for (const field of plugin.fields) {
        const value = instance.options && instance.options[field.id] || field.defaultValue;
        if (!field.choices.some(choice => choice.value === value)) throw new Error('Invalid ' + field.label);
        options[field.id] = value;
      }
      return {
        authType: instance.authType,
        baseUrl: normalizeUrl(instance.baseUrl),
        enabled: instance.enabled !== false,
        id: instance.id,
        name: instance.name.trim(),
        options,
        pluginId: instance.pluginId,
        username,
      };
    }

    function hasSameAuthentication(left, right) {
      return left && right && left.authType === right.authType && left.baseUrl === right.baseUrl && left.pluginId === right.pluginId && left.username === right.username;
    }

    function synchronizeStorage() {
      if (!canPersist) return;
      let raw;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        return;
      }
      if (raw === lastStoredValue) return;
      let next = { enabledPlugins: [], instances: [], version: 1 };
      try {
        const stored = JSON.parse(raw);
        if (stored && stored.version === 1 && Array.isArray(stored.enabledPlugins) && Array.isArray(stored.instances)) next = stored;
      } catch {}
      const nextCredentials = new Map();
      const nextTokens = new Map();
      const instances = [];
      for (const instance of next.instances) {
        if (!instance || typeof instance !== 'object') continue;
        if (!plugins.has(instance.pluginId)) {
          instances.push(instance);
          continue;
        }
        try {
          const normalized = normalizeInstance(instance, true);
          if (instances.some(entry => entry.id === normalized.id)) continue;
          instances.push(normalized);
          if (normalized.authType !== 'none' && normalized.username && typeof instance.secret === 'string' && instance.secret) nextCredentials.set(normalized.id, instance.secret);
          if (normalized.authType === 'bearer' && normalized.username && typeof instance.accessToken === 'string' && instance.accessToken && Number.isFinite(instance.expiresAtMs)) {
            nextTokens.set(normalized.id, { accessToken: instance.accessToken, expiresAtMs: instance.expiresAtMs });
          }
        } catch {}
      }
      for (const previous of settings.instances) {
        if (!plugins.has(previous.pluginId)) continue;
        const current = instances.find(entry => entry.id === previous.id);
        if (!hasSameAuthentication(previous, current) || credentials.get(previous.id) !== nextCredentials.get(previous.id)) clearToken(previous.id);
        credentials.delete(previous.id);
        accessTokens.delete(previous.id);
        if (!current) pending.delete(previous.id);
      }
      nextCredentials.forEach((secret, id) => credentials.set(id, secret));
      nextTokens.forEach((token, id) => accessTokens.set(id, token));
      settings = { enabledPlugins: next.enabledPlugins.filter(id => typeof id === 'string'), instances, version: 1 };
      lastStoredValue = raw;
      listeners.forEach(listener => listener());
    }

    function openStorageDatabase() {
      if (!databasePromise) {
        databasePromise = new Promise(resolve => {
          try {
            const opening = indexedDB.open(STORAGE_KEY, 1);
            opening.onupgradeneeded = () => opening.result.createObjectStore('updates');
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
      return databasePromise;
    }

    /** A readwrite transaction serializes localStorage updates across tabs, including HTTP pages. */
    async function withStorageLock(action) {
      const database = await openStorageDatabase();
      if (!database) {
        canPersist = false;
        return action();
      }
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('updates', 'readwrite');
        const reading = transaction.objectStore('updates').get(STORAGE_KEY);
        let result;
        reading.onsuccess = () => {
          try {
            result = action();
          } catch (error) {
            reject(error);
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('Browser storage update failed'));
      });
    }

    function updateStorage(change) {
      return withStorageLock(() => {
        synchronizeStorage();
        change();
        return persist();
      });
    }

    function persist() {
      if (!canPersist) return false;
      try {
        const raw = JSON.stringify({
          enabledPlugins: settings.enabledPlugins,
          instances: settings.instances.filter(instance => plugins.has(instance.pluginId)).map(instance => ({
            accessToken: accessTokens.get(instance.id)?.accessToken || '',
            ...normalizeInstance(instance, true),
            expiresAtMs: accessTokens.get(instance.id)?.expiresAtMs || 0,
            secret: credentials.get(instance.id) || '',
          })),
          version: 1,
        });
        localStorage.setItem(STORAGE_KEY, raw);
        lastStoredValue = raw;
        return true;
      } catch {
        return false;
      }
    }

    function findInstance(id) {
      synchronizeStorage();
      const instance = settings.instances.find(entry => entry.id === id);
      if (!instance) throw new Error('Instance no longer exists');
      return instance;
    }

    function setCredentials(id, secret) {
      return updateStorage(() => {
        const instance = findInstance(id);
        clearToken(id);
        if (secret && instance.authType !== 'none') credentials.set(id, secret);
        else credentials.delete(id);
      });
    }

    function clearToken(id) {
      accessTokens.delete(id);
      tokenRequests.delete(id);
    }

    async function getAccessToken(instance) {
      if (!instance.username) throw new Error('Enter a username and password for ' + instance.name + ' in Plugins');
      const cached = accessTokens.get(instance.id);
      if (cached && cached.expiresAtMs > Date.now() + 60000) return cached.accessToken;
      if (!tokenRequests.has(instance.id)) {
        const secret = credentials.get(instance.id);
        if (!secret) throw new Error('Enter and save credentials for ' + instance.name + ' in Plugins');
        const operation = Promise.resolve().then(async () => {
          const token = await plugins.get(instance.pluginId).getToken(instance, secret, request);
          return withStorageLock(() => {
            synchronizeStorage();
            if (tokenRequests.get(instance.id) !== operation || credentials.get(instance.id) !== secret) throw new Error('Instance credentials changed; try again');
            accessTokens.set(instance.id, token);
            if (settings.instances.some(entry => entry.id === instance.id)) persist();
            return token.accessToken;
          });
        }).finally(() => {
          if (tokenRequests.get(instance.id) === operation) tokenRequests.delete(instance.id);
        });
        tokenRequests.set(instance.id, operation);
      }
      return tokenRequests.get(instance.id);
    }

    async function request(instance, path, init) {
      const baseUrl = normalizeUrl(instance.baseUrl);
      const url = new URL(baseUrl + '/' + path.replace(/^\/+/, ''));
      if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(new URL(baseUrl + '/').pathname)) {
        throw new Error('Plugin request must stay within the instance base URL');
      }
      const headers = { Accept: 'application/json' };
      if (init && init.body) headers['Content-Type'] = init.contentType || 'application/json';
      if (instance.authType !== 'none' && (!init || init.authenticate !== false)) {
        const secret = credentials.get(instance.id);
        if (!secret) throw new Error('Enter and save credentials for ' + instance.name + ' in Plugins');
        if (instance.authType === 'basic') {
          const bytes = new TextEncoder().encode(instance.username + ':' + secret);
          headers.Authorization = 'Basic ' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
        } else {
          const token = await getAccessToken(instance);
          if (/[\r\n]/.test(token)) throw new Error('Invalid bearer token');
          headers.Authorization = 'Bearer ' + token;
        }
      }
      let response;
      try {
        response = await fetch(url.href, {
          body: init && init.body,
          credentials: 'omit',
          headers,
          method: init && init.method || 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(init && init.timeoutMs || 15000),
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('Connection to ' + instance.name + ' timed out');
        throw new Error('Cannot reach ' + instance.name + '. Check the URL, server CORS origins, and browser HTTPS or local network restrictions');
      }
      if (response.status === 409) return { status: 'exists' };
      if (response.status === 401 || response.status === 403) {
        await withStorageLock(() => {
          synchronizeStorage();
          if (instance.authType === 'bearer' && (!init || init.authenticate !== false) && headers.Authorization === 'Bearer ' + accessTokens.get(instance.id)?.accessToken) {
            clearToken(instance.id);
            if (settings.instances.some(entry => entry.id === instance.id)) persist();
          }
        });
        throw new Error('Authentication failed for ' + instance.name + '; check credentials in Plugins');
      }
      if (!response.ok) throw new Error(instance.name + ' returned HTTP ' + response.status);
      const data = await response.json().catch(() => null);
      return { data, status: 'success' };
    }

    window.torrGatePlugins = {
      authorize: async function(id) {
        const instance = findInstance(id);
        if (instance.authType !== 'bearer') throw new Error('Choose Bearer sign-in to acquire a token');
        await getAccessToken(instance);
      },
      createInstanceId,
      getInstances: function(pluginId) {
        synchronizeStorage();
        return settings.instances.filter(instance => plugins.has(instance.pluginId) && (!pluginId || instance.pluginId === pluginId)).map(instance => ({ ...instance, options: { ...instance.options } }));
      },
      getPlugins: function() {
        return Array.from(plugins.values());
      },
      getTargets: function(pluginId) {
        synchronizeStorage();
        if (!settings.enabledPlugins.includes(pluginId)) return [];
        return this.getInstances(pluginId).filter(instance => instance.enabled);
      },
      hasCredentials: function(id) {
        synchronizeStorage();
        return credentials.has(id);
      },
      isEnabled: function(pluginId) {
        synchronizeStorage();
        return settings.enabledPlugins.includes(pluginId);
      },
      register: function(plugin) {
        if (!/^[a-z][a-z0-9-]*$/.test(plugin.id) || plugins.has(plugin.id)) throw new Error('Invalid or duplicate plugin ID');
        plugins.set(plugin.id, plugin);
        const instances = [];
        for (const instance of settings.instances) {
          if (instance.pluginId !== plugin.id) {
            instances.push(instance);
            continue;
          }
          try {
            const normalized = normalizeInstance(instance, true);
            if (!instances.some(entry => entry.id === normalized.id)) {
              instances.push(normalized);
              if (normalized.authType !== 'none' && normalized.username && typeof instance.secret === 'string' && instance.secret) {
                credentials.set(normalized.id, instance.secret);
              }
              if (normalized.authType === 'bearer' && normalized.username && typeof instance.accessToken === 'string' && instance.accessToken && Number.isFinite(instance.expiresAtMs)) {
                accessTokens.set(normalized.id, { accessToken: instance.accessToken, expiresAtMs: instance.expiresAtMs });
              }
            }
          } catch {}
        }
        settings.instances = instances;
      },
      removeInstance: function(id) {
        return updateStorage(() => {
          settings.instances = settings.instances.filter(instance => instance.id !== id);
          credentials.delete(id);
          clearToken(id);
          pending.delete(id);
        });
      },
      send: async function(id, item, resolveMagnet) {
        const instance = findInstance(id);
        const plugin = plugins.get(instance.pluginId);
        if (!instance.enabled || !this.isEnabled(instance.pluginId)) throw new Error('Enable this plugin and instance in Plugins');
        if (!plugin.canHandle(item)) throw new Error('No magnet link available for this release');
        if (!pending.has(id)) pending.set(id, new WeakSet());
        const items = pending.get(id);
        if (items.has(item)) return { status: 'pending' };
        items.add(item);
        try {
          const magnetUri = await resolveMagnet(item);
          if (!magnetUri || !magnetUri.startsWith('magnet:?')) throw new Error('No valid magnet link available for this release');
          const current = findInstance(id);
          if (!hasSameAuthentication(instance, current) || !current.enabled || !this.isEnabled(current.pluginId)) throw new Error('Instance settings changed; try again');
          return await plugin.send(instance, item, magnetUri, request);
        } finally {
          items.delete(item);
        }
      },
      setCredentials,
      setEnabled: function(pluginId, isEnabled) {
        return updateStorage(() => {
          if (!plugins.has(pluginId)) throw new Error('Unknown plugin');
          settings.enabledPlugins = settings.enabledPlugins.filter(id => id !== pluginId);
          if (isEnabled) settings.enabledPlugins.push(pluginId);
        });
      },
      subscribe: function(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      test: async function(instance, secret) {
        synchronizeStorage();
        const normalized = normalizeInstance(instance);
        // Draft credentials never replace a saved instance's credentials.
        const draftId = 'draft-' + createInstanceId();
        normalized.id = draftId;
        if (secret) credentials.set(draftId, secret);
        else {
          const previous = settings.instances.find(entry => entry.id === instance.id);
          if (previous && previous.baseUrl === normalized.baseUrl && previous.authType === normalized.authType && previous.username === normalized.username && previous.pluginId === normalized.pluginId && credentials.has(instance.id)) {
            credentials.set(draftId, credentials.get(instance.id));
          }
        }
        try {
          return await plugins.get(normalized.pluginId).test(normalized, request);
        } finally {
          credentials.delete(draftId);
          clearToken(draftId);
        }
      },
      upsertInstance: function(instance, secret) {
        return updateStorage(() => {
          const normalized = normalizeInstance(instance);
          const previous = settings.instances.find(entry => entry.id === normalized.id);
          if (previous && (previous.baseUrl !== normalized.baseUrl || previous.authType !== normalized.authType || previous.username !== normalized.username || previous.pluginId !== normalized.pluginId)) {
            credentials.delete(normalized.id);
            clearToken(normalized.id);
          }
          settings.instances = settings.instances.filter(entry => entry.id !== normalized.id);
          settings.instances.push(normalized);
          if (normalized.authType === 'none') {
            credentials.delete(normalized.id);
            clearToken(normalized.id);
          } else if (secret) {
            if (credentials.get(normalized.id) !== secret) clearToken(normalized.id);
            credentials.set(normalized.id, secret);
          }
        });
      },
    };
  })();`;
