// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const SEARCH_SCRIPT = String.raw`
function createSearch({ getEnabledTrackerIds, indexerSelect, queryInput, renderError, renderIndexerWarnings, renderLoading, sortAndRenderResults, state }) {
  async function performSearch() {
    const previousController = state.activeSearchController;
    const controller = new AbortController();
    state.activeSearchController = controller;
    if (previousController) previousController.abort();
    const query = queryInput.value.trim();
    const selectedIndexer = indexerSelect.value || 'all';

    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (state.activeCategory) params.append('category', state.activeCategory);

    if (selectedIndexer === 'all') {
      const enabledIds = getEnabledTrackerIds();
      if (enabledIds.length === 0) {
        renderError('No trackers are currently enabled. Please enable at least one tracker in settings.');
        return;
      }
      if (enabledIds.length < state.availableIndexers.length) {
        enabledIds.forEach(id => params.append('Tracker[]', id));
      }
    }

    renderLoading();

    const url = '/api/v2.0/indexers/' + encodeURIComponent(selectedIndexer) + '/results?' + params.toString();

    const startTime = Date.now();
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (state.activeSearchController !== controller) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Search request failed' }));
        if (state.activeSearchController !== controller) return;
        renderError(err.message || 'Upstream search error occurred');
        return;
      }

      const data = await res.json();
      if (state.activeSearchController !== controller) return;
      const elapsedMs = Date.now() - startTime;
      state.currentResults = data.Results || [];
      renderIndexerWarnings(data.Indexers || []);
      sortAndRenderResults(elapsedMs);
    } catch (err) {
      if (state.activeSearchController !== controller) return;
      renderError(err instanceof Error ? err.message : 'Network error communicating with gateway');
    }
  }

  return { performSearch };
}
`;
