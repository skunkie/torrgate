// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const MAGNETS_SCRIPT = String.raw`
function createMagnets({ showToast, state, viewDetails }) {
  function getMagnetEndpoint(item) {
    if (!item || !item.Link) return null;
    try {
      const parsed = new URL(item.Link, window.location.origin);
      if (parsed.origin !== window.location.origin || !/^\/api\/v2\.0\/indexers\/[^/]+\/download$/.test(parsed.pathname)) {
        return null;
      }
      return parsed.pathname.slice(0, -'/download'.length) + '/magnet' + parsed.search;
    } catch {
      return null;
    }
  }

  async function resolveMagnet(item) {
    if (item.MagnetUri) return item.MagnetUri;
    const endpoint = getMagnetEndpoint(item);
    if (!endpoint) return null;
    if (!item.magnetRequest) {
      item.magnetRequest = fetch(endpoint)
        .then(async res => {
          const body = await res.json().catch(() => null);
          if (!res.ok || !body || !body.MagnetUri) {
            throw new Error((body && body.message) || 'Could not read magnet link from .torrent file');
          }
          item.MagnetUri = body.MagnetUri;
          item.InfoHash = item.InfoHash || body.InfoHash;
          return body.MagnetUri;
        })
        .finally(() => {
          item.magnetRequest = null;
        });
    }
    return item.magnetRequest;
  }

  async function copyItemMagnet(item) {
    if (!item.MagnetUri) {
      showToast('Fetching magnet link from .torrent file...');
    }
    let magnetUri;
    try {
      magnetUri = await resolveMagnet(item);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read magnet link from .torrent file');
      return;
    }
    if (!magnetUri) {
      showToast('No magnet link available for this release');
      return;
    }
    const showMagnetInDetails = () => {
      const index = state.currentResults.indexOf(item);
      if (index === -1) return;
      viewDetails(index);
      const input = document.getElementById('modal-magnet-val');
      if (input) input.select();
      showToast('Clipboard unavailable. Copy the magnet link from the details');
    };
    if (!navigator.clipboard) {
      showMagnetInDetails();
      return;
    }
    navigator.clipboard.writeText(magnetUri).then(() => {
      showToast('Magnet link copied to clipboard!');
    }, showMagnetInDetails);
  }

  return { copyItemMagnet, getMagnetEndpoint, resolveMagnet };
}
`;
