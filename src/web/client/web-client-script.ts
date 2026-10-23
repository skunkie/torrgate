// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { DETAILS_SCRIPT } from './details-script.js';
import { FORMATTING_SCRIPT } from './formatting-script.js';
import { INSTALL_SCRIPT } from './install-script.js';
import { KEYBOARD_SCRIPT } from './keyboard-script.js';
import { MAGNETS_SCRIPT } from './magnets-script.js';
import { RESULTS_SCRIPT } from './results-script.js';
import { SEARCH_SCRIPT } from './search-script.js';
import { TRACKERS_SCRIPT } from './trackers-script.js';
import { UI_SCRIPT } from './ui-script.js';

export const WEB_CLIENT_SCRIPT = '(function() {\n' + [
  DETAILS_SCRIPT,
  FORMATTING_SCRIPT,
  INSTALL_SCRIPT,
  KEYBOARD_SCRIPT,
  MAGNETS_SCRIPT,
  RESULTS_SCRIPT,
  SEARCH_SCRIPT,
  TRACKERS_SCRIPT,
  UI_SCRIPT,
  String.raw`
      const queryInput = document.getElementById('query-input');
      const indexerSelect = document.getElementById('indexer-select');
      const searchForm = document.getElementById('search-form');
      const resultsList = document.getElementById('results-list');
      const resultsBar = document.getElementById('results-bar');
      const resultsStats = document.getElementById('results-stats');
      const indexerWarnings = document.getElementById('indexer-warnings');
      const sortSelect = document.getElementById('sort-select');
      const categoryPills = document.getElementById('category-pills');

      // Modals
      const modalTrackers = document.getElementById('modal-trackers');
      const modalIntegration = document.getElementById('modal-integration');
      const modalDetails = document.getElementById('modal-details');
      const modalShortcuts = document.getElementById('modal-shortcuts');

      const state = {
        activeCategory: '',
        activeResultIndex: -1,
        activeSearchController: null,
        availableIndexers: [],
        currentResults: [],
        currentStatusMap: null,
        detailsItem: null,
      };
      const renderPluginActions = (item, index) => window.torrGatePluginUi.renderActions(item, index);
      const { escapeHtml, formatBytes, getLeechers, isSafeUrl } = createFormatting();
      const { closeModal, openModal, showToast } = createUi({ escapeHtml });
      const { copyItemMagnet, getMagnetEndpoint, resolveMagnet } = createMagnets({ showToast, state, viewDetails: index => window.viewDetails(index) });
      const { viewDetails } = createDetails({ escapeHtml, formatBytes, getLeechers, getMagnetEndpoint, isSafeUrl, modalDetails, openModal, renderPluginActions, resolveMagnet, showToast, state });
      window.viewDetails = viewDetails;
      const { checkTrackerAvailability, disableOfflineTrackers, fetchIndexers, getEnabledTrackerIds, handleTrackerToggle, toggleAllTrackers } = createTrackers({ escapeHtml, indexerSelect, showToast, state });
      const { renderError, renderIndexerWarnings, renderLoading, sortAndRenderResults } = createResults({ escapeHtml, formatBytes, getLeechers, getMagnetEndpoint, indexerWarnings, isSafeUrl, renderPluginActions, resultsBar, resultsList, resultsStats, sortSelect, state });
      const { performSearch } = createSearch({ getEnabledTrackerIds, indexerSelect, queryInput, renderError, renderIndexerWarnings, renderLoading, sortAndRenderResults, state });
      const { highlightResult } = createKeyboard({ closeModal, copyItemMagnet, getMagnetEndpoint, modalIntegration, modalShortcuts, modalTrackers, openModal, queryInput, showToast, state, viewDetails });
      window.highlightResult = highlightResult;
      initializeInstall({ showToast });

      window.torrGatePluginUi.initialize({
        closeModal,
        escapeHtml,
        openModal,
        refreshActions: function() {
          if (state.currentResults.length) sortAndRenderResults();
          if (modalDetails.classList.contains('open') && state.detailsItem) {
            const index = state.currentResults.indexOf(state.detailsItem);
            if (index >= 0) window.viewDetails(index);
          }
        },
        resolveMagnet,
        showToast,
      });

      // Populate integration URLs
      const origin = window.location.origin;
      document.getElementById('feed-url-all').value = origin + '/api/v2.0/indexers/all/results/torznab/api';
      document.getElementById('feed-url-indexer').value = origin + '/api/v2.0/indexers/{indexer}/results/torznab/api';

      // Load indexer list
      fetchIndexers();

      // Event Listeners
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        performSearch();
      });

      categoryPills.addEventListener('click', function(e) {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('.pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
        state.activeCategory = pill.getAttribute('data-category') || '';
        performSearch();
      });

      sortSelect.addEventListener('change', function() {
        sortAndRenderResults();
      });

      // Modal Triggers & Actions
      document.getElementById('btn-open-trackers').addEventListener('click', function() {
        openModal(modalTrackers);
      });
      document.getElementById('btn-open-integration').addEventListener('click', function() {
        openModal(modalIntegration);
      });
      document.getElementById('btn-open-shortcuts').addEventListener('click', function() {
        openModal(modalShortcuts);
      });
      document.getElementById('btn-check-trackers').addEventListener('click', function() {
        checkTrackerAvailability();
      });
      document.getElementById('btn-toggle-all').addEventListener('click', function() {
        toggleAllTrackers();
      });
      document.getElementById('btn-disable-offline').addEventListener('click', function() {
        disableOfflineTrackers();
      });
      document.addEventListener('click', function(e) {
        const pluginButton = e.target.closest('.btn-plugin-action');
        if (pluginButton) {
          const item = state.currentResults[parseInt(pluginButton.getAttribute('data-index'), 10)];
          if (item) window.torrGatePluginUi.handleAction(pluginButton, item);
          return;
        }
        const copyButton = e.target.closest('.btn-copy-input');
        if (copyButton) {
          copyFromInput(copyButton.getAttribute('data-input-id'));
        }
      });
      document.getElementById('tracker-table-body').addEventListener('change', function(e) {
        const target = e.target;
        if (target && target.matches('input[data-tracker-id]')) {
          const trackerId = target.getAttribute('data-tracker-id');
          handleTrackerToggle(trackerId, target.checked);
        }
      });

      document.querySelectorAll('[data-close]').forEach(button => {
        button.addEventListener('click', function() {
          const targetId = this.getAttribute('data-close');
          closeModal(document.getElementById(targetId));
        });
      });

      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
          if (e.target === this) {
            closeModal(this);
          }
        });
      });

      resultsList.addEventListener('click', function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;
        if (e.target.closest('.btn-plugin-action')) return;

        const magnetButton = e.target.closest('.btn-copy-magnet');
        if (magnetButton) {
          e.stopPropagation();
          const resultIndex = parseInt(magnetButton.getAttribute('data-index'), 10);
          const item = state.currentResults[resultIndex];
          if (item) {
            copyItemMagnet(item);
          }
          return;
        }

        const detailsButton = e.target.closest('.btn-view-details');
        if (detailsButton) {
          e.stopPropagation();
          const resultIndex = parseInt(detailsButton.getAttribute('data-index'), 10);
          window.viewDetails(resultIndex);
          return;
        }

        const card = e.target.closest('.torrent-card');
        if (card) {
          const resultIndex = parseInt(card.getAttribute('data-index'), 10);
          window.highlightResult(resultIndex);
        }
      });
`,
].join('\n') + '\n})();';
