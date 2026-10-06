// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const QBITTORRENT_PLUGIN_SCRIPT = String.raw`
  (function() {
    async function validateVersion(instance, request) {
      const result = await request(instance, 'api/v2/app/version', { responseType: 'text', targetAddressSpace: instance.options.addressSpace === 'auto' ? undefined : instance.options.addressSpace });
      const match = typeof result.data === 'string' && /^v?(\d+)\.(\d+)\.\d+(?:[-+\w.]*)$/.exec(result.data.trim());
      if (!match || Number(match[1]) < 5 || (Number(match[1]) === 5 && Number(match[2]) < 2)) throw new Error('The URL did not return a supported qBittorrent version (5.2 or newer)');
    }

    window.torrGatePlugins.register({
      actionLabel: 'Send to qBittorrent',
      authTypes: [{ label: 'API key (5.2+)', value: 'api-key' }],
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
        defaultValue: '',
        id: 'savepath',
        label: 'Download folder',
        placeholder: 'Use instance default',
        type: 'text',
      }, {
        defaultValue: '',
        id: 'category',
        label: 'Category',
        placeholder: 'Use instance default',
        type: 'text',
      }, {
        defaultValue: '',
        id: 'tags',
        label: 'Tags',
        placeholder: 'torrgate, downloads',
        type: 'text',
      }, {
        choices: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }],
        defaultValue: 'true',
        id: 'shouldStart',
        label: 'Start downloading automatically',
      }],
      id: 'qbittorrent',
      name: 'qBittorrent',
      secretPattern: '^qbt_[A-Za-z0-9]{28}$',
      send: async function(instance, _item, magnetUri, request) {
        await validateVersion(instance, request);
        const body = new URLSearchParams({ urls: magnetUri });
        for (const key of ['category', 'savepath', 'tags']) {
          if (instance.options[key]) body.set(key, instance.options[key]);
        }
        if (instance.options.savepath) body.set('autoTMM', 'false');
        body.set('stopped', String(instance.options.shouldStart === 'false'));
        const result = await request(instance, 'api/v2/torrents/add', {
          body: body.toString(),
          contentType: 'application/x-www-form-urlencoded',
          method: 'POST',
          responseType: 'text',
          targetAddressSpace: instance.options.addressSpace === 'auto' ? undefined : instance.options.addressSpace,
        });
        if (result.status !== 'success' || typeof result.data !== 'string' || result.data.trim() !== 'Ok.') throw new Error('qBittorrent did not accept the magnet; check its download settings and whether the torrent already exists');
        return result;
      },
      test: async function(instance, request) {
        await validateVersion(instance, request);
        return { status: 'success' };
      },
    });
  })();`;
