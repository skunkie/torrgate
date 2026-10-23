// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const DETAILS_SCRIPT = String.raw`
function createDetails({ escapeHtml, formatBytes, getLeechers, getMagnetEndpoint, isSafeUrl, modalDetails, openModal, renderPluginActions, resolveMagnet, showToast, state }) {
  document.getElementById('details-modal-body').addEventListener('click', async function(e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const fetchButton = e.target.closest('.btn-fetch-magnet');
    if (!fetchButton) return;

    const index = parseInt(fetchButton.getAttribute('data-index'), 10);
    const item = state.currentResults[index];
    if (!item) return;
    fetchButton.disabled = true;
    try {
      await resolveMagnet(item);
    } catch (err) {
      fetchButton.disabled = false;
      showToast(err instanceof Error ? err.message : 'Could not read magnet link from .torrent file');
      return;
    }
    if (modalDetails.classList.contains('open') && state.detailsItem === item) {
      viewDetails(index);
    }
  });

  function viewDetails(index) {
    const item = state.currentResults[index];
    if (!item) return;
    state.detailsItem = item;

    document.getElementById('details-modal-title').textContent = item.Title;
    const body = document.getElementById('details-modal-body');
    const formattedSize = formatBytes(item.Size);
    const magnetHtml = item.MagnetUri
      ? '<div class="integration-box"><div class="integration-label">Magnet URI</div><div class="copy-input-row"><input type="text" readonly class="copy-input" id="modal-magnet-val" value="' + escapeHtml(item.MagnetUri) + '"><button type="button" class="nav-btn btn-copy-input" data-input-id="modal-magnet-val">Copy</button></div></div>'
      : getMagnetEndpoint(item)
        ? '<div class="integration-box"><div class="integration-label">Magnet URI</div><button type="button" class="nav-btn btn-fetch-magnet" data-index="' + index + '">Get magnet link from .torrent</button></div>'
        : '<p class="details-empty-magnet">No direct magnet link available for this release.</p>';

    const infoHashHtml = item.InfoHash
      ? '<div class="details-info-hash"><strong>InfoHash:</strong> <code>' + escapeHtml(item.InfoHash) + '</code></div>'
      : '';

    const topicLinkHtml = (item.Details && isSafeUrl(item.Details))
      ? '<a href="' + escapeHtml(item.Details) + '" target="_blank" rel="noopener noreferrer" class="nav-btn details-topic-link">Open Tracker Topic <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>'
      : '';

    const posterHtml = item.Poster && isSafeUrl(item.Poster)
      ? '<img class="details-poster" src="' + escapeHtml(item.Poster) + '" alt="Poster for ' + escapeHtml(item.Title) + '" width="112" height="168" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : '';
    const descriptionHtml = item.Description
      ? '<p class="details-description">' + escapeHtml(item.Description) + '</p>'
      : '';
    const metadataHtml = posterHtml || descriptionHtml
      ? '<div class="details-metadata">' + posterHtml + descriptionHtml + '</div>'
      : '';

    body.innerHTML =
      '<div class="details-actions">' +
        '<span class="badge badge-tracker">' + escapeHtml(item.Tracker) + '</span>' +
        '<span class="badge badge-category">' + escapeHtml(item.CategoryDesc || 'Other') + '</span>' +
        '<span class="meta-stat stat-size">' + formattedSize + '</span>' +
        '<span class="meta-stat stat-seed">▲ ' + (Number(item.Seeders) || 0) + ' seeders</span>' +
        '<span class="meta-stat stat-leech">▼ ' + getLeechers(item) + ' leechers</span>' +
      '</div>' +
      metadataHtml +
      infoHashHtml +
      magnetHtml +
      '<div class="details-actions">' + renderPluginActions(item, index) + '</div>' +
      topicLinkHtml;

    const poster = body.querySelector('.details-poster');
    if (poster) {
      poster.addEventListener('error', function() {
        poster.remove();
        const metadata = body.querySelector('.details-metadata');
        if (metadata && !metadata.children.length) metadata.remove();
      }, { once: true });
    }

    openModal(modalDetails);
  }
  return { viewDetails };
}
`;
