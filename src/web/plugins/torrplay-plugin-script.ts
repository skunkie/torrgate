// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const TORRPLAY_PLUGIN_SCRIPT = String.raw`
  window.torrGatePlugins.register({
    actionLabel: 'Send to TorrPlay',
    canHandle: function(item) {
      if (item.MagnetUri) return true;
      if (!item.Link) return false;
      try {
        const url = new URL(item.Link, window.location.origin);
        return url.origin === window.location.origin && /^\/api\/v2\.0\/indexers\/[^/]+\/download$/.test(url.pathname);
      } catch {
        return false;
      }
    },
    fields: [{
      choices: [{ label: 'Automatic', value: 'auto' }, { label: 'Local network', value: 'local' }, { label: 'This computer (localhost)', value: 'loopback' }],
      defaultValue: 'auto',
      id: 'addressSpace',
      label: 'Instance location',
    }, {
      choices: [{ label: 'Memory', value: 'memory' }, { label: 'File', value: 'file' }],
      defaultValue: 'memory',
      id: 'storage',
      label: 'Torrent storage',
    }],
    getToken: async function(instance, password, request) {
      const startedAtMs = Date.now();
      const result = await request(instance, 'oauth/token', {
        authenticate: false,
        body: new URLSearchParams({ grant_type: 'password', password, username: instance.username }).toString(),
        contentType: 'application/x-www-form-urlencoded',
        method: 'POST',
        targetAddressSpace: instance.options.addressSpace === 'auto' ? undefined : instance.options.addressSpace,
      });
      const data = result.data;
      if (!data || typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token) || String(data.token_type).toLowerCase() !== 'bearer') throw new Error('TorrPlay returned an invalid token response');
      let expiresAtMs;
      if (Number.isFinite(data.expires_in) && data.expires_in > 0) {
        expiresAtMs = startedAtMs + data.expires_in * 1000;
      } else {
        try {
          const payload = data.access_token.split('.')[1];
          const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
          expiresAtMs = claims.exp * 1000;
        } catch {}
      }
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) throw new Error('TorrPlay returned a token without a valid expiration');
      return { accessToken: data.access_token, expiresAtMs };
    },
    id: 'torrplay',
    name: 'TorrPlay',
    send: async function(instance, item, magnetUri, request) {
      const result = await request(instance, 'api/v1/torrents', {
        body: JSON.stringify({ magnet: magnetUri, storage: instance.options.storage, title: item.Title }),
        method: 'POST',
        targetAddressSpace: instance.options.addressSpace === 'auto' ? undefined : instance.options.addressSpace,
        timeoutMs: 45000,
      });
      if (result.status === 'success' && (!result.data || typeof result.data.hash !== 'string')) throw new Error('TorrPlay returned an unexpected torrent response');
      return result;
    },
    test: async function(instance, request) {
      const result = await request(instance, 'api/v1/torrents?limit=1', { targetAddressSpace: instance.options.addressSpace === 'auto' ? undefined : instance.options.addressSpace });
      if (result.status !== 'success' || !result.data || !Array.isArray(result.data.torrents)) throw new Error('The URL did not return a TorrPlay torrent list');
      return result;
    },
  });`;
