// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const RESULTS_SCRIPT = String.raw`
function createResults({ escapeHtml, formatBytes, getLeechers, getMagnetEndpoint, indexerWarnings, isSafeUrl, renderPluginActions, resultsBar, resultsList, resultsStats, sortSelect, state }) {
  function sortAndRenderResults(elapsedMs) {
    state.activeResultIndex = -1;
    const sortMode = sortSelect.value;

    state.currentResults.sort((a, b) => {
      switch (sortMode) {
        case 'seeders-desc':
          return (b.Seeders || 0) - (a.Seeders || 0);
        case 'date-desc':
          return new Date(b.PublishDate || 0).getTime() - new Date(a.PublishDate || 0).getTime();
        case 'size-desc':
          return (b.Size || 0) - (a.Size || 0);
        case 'size-asc':
          return (a.Size || 0) - (b.Size || 0);
        case 'leechers-desc':
          return (b.Peers || 0) - (a.Peers || 0);
        case 'title-asc':
          return (a.Title || '').localeCompare(b.Title || '');
        default:
          return (b.Seeders || 0) - (a.Seeders || 0);
      }
    });

    resultsBar.classList.remove('is-hidden');
    const elapsedText = elapsedMs !== undefined ? ' (' + elapsedMs + ' ms)' : '';
    resultsStats.textContent = state.currentResults.length + ' releases' + elapsedText;

    if (state.currentResults.length === 0) {
      resultsList.innerHTML =
        '<div class="empty-state">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
          '<h3>No releases found</h3>' +
          '<p>Try adjusting your search terms or selecting a different category filter.</p>' +
        '</div>';
      return;
    }

    resultsList.innerHTML = state.currentResults.map((item, resultIndex) => {
      const formattedSize = formatBytes(item.Size);
      const publishDate = item.PublishDate ? item.PublishDate.slice(0, 10) : '';
      const hasMagnet = Boolean(item.MagnetUri) || Boolean(getMagnetEndpoint(item));
      const hasDownload = Boolean(item.Link) && isSafeUrl(item.Link);

      const magnetButtonHtml = hasMagnet
        ? '<button type="button" class="action-btn magnet-btn btn-copy-magnet" data-index="' + resultIndex + '" title="' + (item.MagnetUri ? 'Copy Magnet URI' : 'Get magnet URI from .torrent file') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 3v7a6 6 0 0 0 12 0V3"></path><line x1="2" y1="7" x2="6" y2="7"></line><line x1="18" y1="7" x2="22" y2="7"></line></svg> Magnet</button>'
        : '<button type="button" class="action-btn" disabled title="No magnet available">Magnet</button>';

      const downloadLinkHtml = hasDownload
        ? '<a href="' + escapeHtml(item.Link) + '" class="action-btn" download title="Download .torrent file"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> .torrent</a>'
        : '';

      return '<div class="torrent-card" data-index="' + resultIndex + '">' +
        '<div class="torrent-main">' +
          '<div class="torrent-title">' + escapeHtml(item.Title) + '</div>' +
          '<div class="torrent-meta">' +
            '<span class="badge badge-tracker">' + escapeHtml(item.Tracker) + '</span>' +
            '<span class="badge badge-category">' + escapeHtml(item.CategoryDesc || 'Other') + '</span>' +
            '<span class="meta-stat stat-size">' + formattedSize + '</span>' +
            '<span class="meta-stat stat-seed">▲ ' + (Number(item.Seeders) || 0) + '</span>' +
            '<span class="meta-stat stat-leech">▼ ' + getLeechers(item) + '</span>' +
            (publishDate ? '<span class="meta-stat">' + escapeHtml(publishDate) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="torrent-actions">' +
          renderPluginActions(item, resultIndex) +
          magnetButtonHtml +
          downloadLinkHtml +
          '<button type="button" class="action-btn btn-view-details" data-index="' + resultIndex + '" title="View Topic Details">Info</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderIndexerWarnings(indexers) {
    const failed = indexers.filter(indexer => indexer && indexer.Error);
    indexerWarnings.replaceChildren();
    indexerWarnings.hidden = failed.length === 0;
    if (failed.length === 0) return;

    const heading = document.createElement('div');
    heading.textContent = failed.length === 1
      ? '1 tracker could not be searched:'
      : failed.length + ' trackers could not be searched:';
    const list = document.createElement('ul');
    failed.forEach(indexer => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = indexer.Name || indexer.ID;
      item.append(name, ' — ' + indexer.Error);
      list.append(item);
    });
    indexerWarnings.append(heading, list);
  }

  function renderLoading() {
    indexerWarnings.hidden = true;
    resultsBar.classList.add('is-hidden');
    resultsList.innerHTML = [1, 2, 3, 4].map(() =>
      '<div class="skeleton-card">' +
        '<div class="skeleton-line skeleton-line-wide"></div>' +
        '<div class="skeleton-line skeleton-line-short"></div>' +
      '</div>'
    ).join('');
  }

  function renderError(message) {
    indexerWarnings.hidden = true;
    resultsBar.classList.add('is-hidden');
    resultsList.innerHTML =
      '<div class="empty-state error">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
        '<h3>Search failed</h3>' +
        '<p>' + escapeHtml(message) + '</p>' +
      '</div>';
  }

  return { renderError, renderIndexerWarnings, renderLoading, sortAndRenderResults };
}
`;
