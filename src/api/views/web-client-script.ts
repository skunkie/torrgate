// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const WEB_CLIENT_SCRIPT = String.raw`
    (function() {
      let currentResults = [];
      let activeCategory = '';
      let availableIndexers = [];
      let currentStatusMap = null;

      const STORAGE_KEY_ENABLED = 'torrgate_enabled_trackers';
      const STORAGE_KEY_HEALTH = 'torrgate_tracker_health';
      const HEALTH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
      let activeResultIndex = -1;

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
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeCategory = pill.getAttribute('data-category') || '';
        if (queryInput.value.trim()) {
          performSearch();
        }
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

      document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', function() {
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

        const magnetBtn = e.target.closest('.btn-copy-magnet');
        if (magnetBtn) {
          e.stopPropagation();
          const idx = parseInt(magnetBtn.getAttribute('data-index'), 10);
          const item = currentResults[idx];
          if (item) {
            copyItemMagnet(item);
          }
          return;
        }

        const detailsBtn = e.target.closest('.btn-view-details');
        if (detailsBtn) {
          e.stopPropagation();
          const idx = parseInt(detailsBtn.getAttribute('data-index'), 10);
          window.viewDetails(idx);
          return;
        }

        const card = e.target.closest('.torrent-card');
        if (card) {
          const idx = parseInt(card.getAttribute('data-index'), 10);
          window.highlightResult(idx);
        }
      });

      window.highlightResult = function(index) {
        const cards = document.querySelectorAll('.torrent-card');
        if (cards.length === 0) {
          activeResultIndex = -1;
          return;
        }

        if (index < 0) {
          if (activeResultIndex >= 0 && cards[activeResultIndex]) {
            cards[activeResultIndex].classList.remove('active-card');
          }
          activeResultIndex = -1;
          queryInput.focus();
          return;
        }

        if (index >= cards.length) {
          index = cards.length - 1;
        }

        cards.forEach((card, idx) => {
          if (idx === index) {
            card.classList.add('active-card');
            card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else {
            card.classList.remove('active-card');
          }
        });

        activeResultIndex = index;
      };

      document.addEventListener('keydown', function(e) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
        const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay.open'));

        // Cmd+K / Ctrl+K: Focus search from anywhere
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          document.querySelectorAll('.modal-overlay.open').forEach(closeModal);
          queryInput.focus();
          queryInput.select();
          return;
        }

        // Escape key handling
        if (e.key === 'Escape') {
          if (isAnyModalOpen) {
            document.querySelectorAll('.modal-overlay.open').forEach(closeModal);
            return;
          }
          if (document.activeElement === queryInput) {
            if (queryInput.value) {
              queryInput.value = '';
            } else {
              queryInput.blur();
            }
            return;
          }
          if (activeResultIndex >= 0) {
            highlightResult(-1);
            return;
          }
          return;
        }

        // If inside an input or modal, do not intercept single-letter shortcuts
        if (isInput || isAnyModalOpen) {
          return;
        }

        // Focus search with '/'
        if (e.key === '/') {
          e.preventDefault();
          queryInput.focus();
          queryInput.select();
          return;
        }

        // Show shortcuts modal with '?'
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          e.preventDefault();
          openModal(modalShortcuts);
          return;
        }

        // Open Trackers with 't'
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          openModal(modalTrackers);
          return;
        }

        // Open Integration with 'i' or 'c'
        if (e.key === 'i' || e.key === 'I' || e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          openModal(modalIntegration);
          return;
        }

        // Results navigation and actions
        if (currentResults.length > 0) {
          if (e.key === 'j' || e.key === 'ArrowDown') {
            e.preventDefault();
            highlightResult(activeResultIndex + 1);
            return;
          }

          if (e.key === 'k' || e.key === 'ArrowUp') {
            e.preventDefault();
            highlightResult(activeResultIndex - 1);
            return;
          }

          if (activeResultIndex >= 0 && activeResultIndex < currentResults.length) {
            const item = currentResults[activeResultIndex];

            if (e.key === 'Enter') {
              e.preventDefault();
              window.viewDetails(activeResultIndex);
              return;
            }

            if (e.key === 'm' || e.key === 'M') {
              e.preventDefault();
              if (item.MagnetUri || getMagnetEndpoint(item)) {
                copyItemMagnet(item);
              } else {
                showToast('No magnet link available for this release');
              }
              return;
            }

            if (e.key === 'd' || e.key === 'D') {
              e.preventDefault();
              if (item.Link) {
                const a = document.createElement('a');
                a.href = item.Link;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('Downloading .torrent file...');
              } else {
                showToast('No download link available for this release');
              }
              return;
            }
          }
        }
      });

      function openModal(modal) {
        modal.classList.add('open');
      }

      function closeModal(modal) {
        modal.classList.remove('open');
      }

      function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>' + escapeHtml(message) + '</span>';
        container.appendChild(toast);
        setTimeout(() => {
          toast.classList.add('closing');
          setTimeout(() => toast.remove(), 300);
        }, 2800);
      }

      window.copyFromInput = function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('Copied to clipboard!');
        });
      };

      function getMagnetEndpoint(item) {
        if (!item || !item.Link) return null;
        try {
          const parsed = new URL(item.Link, window.location.origin);
          if (!parsed.pathname.startsWith('/api/v2.0/indexers/') || !parsed.pathname.endsWith('/download')) {
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
          const index = currentResults.indexOf(item);
          if (index === -1) return;
          window.viewDetails(index);
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

      document.getElementById('details-modal-body').addEventListener('click', async function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const fetchBtn = e.target.closest('.btn-fetch-magnet');
        if (!fetchBtn) return;

        const index = parseInt(fetchBtn.getAttribute('data-index'), 10);
        const item = currentResults[index];
        if (!item) return;
        fetchBtn.disabled = true;
        try {
          await resolveMagnet(item);
        } catch (err) {
          fetchBtn.disabled = false;
          showToast(err instanceof Error ? err.message : 'Could not read magnet link from .torrent file');
          return;
        }
        if (modalDetails.classList.contains('open') && detailsItem === item) {
          window.viewDetails(index);
        }
      });

      let detailsItem = null;

      window.viewDetails = function(index) {
        const item = currentResults[index];
        if (!item) return;
        detailsItem = item;

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

        const topicLinkHtml = (item.Details && isSafeUrl(item.Details, false))
          ? '<a href="' + escapeHtml(item.Details) + '" target="_blank" rel="noopener noreferrer" class="nav-btn details-topic-link">Open Tracker Topic <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>'
          : '';

        body.innerHTML =
          '<div class="details-actions">' +
            '<span class="badge badge-tracker">' + escapeHtml(item.Tracker) + '</span>' +
            '<span class="badge badge-category">' + escapeHtml(item.CategoryDesc || 'Other') + '</span>' +
            '<span class="meta-stat stat-size">' + formattedSize + '</span>' +
            '<span class="meta-stat stat-seed">▲ ' + item.Seeders + ' seeders</span>' +
            '<span class="meta-stat stat-leech">▼ ' + item.Peers + ' leechers</span>' +
          '</div>' +
          infoHashHtml +
          magnetHtml +
          topicLinkHtml;

        openModal(modalDetails);
      };

      function getEnabledTrackerIds() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_ENABLED);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch {
          // Ignore localStorage errors
        }
        return availableIndexers.map(idx => idx.id);
      }

      function saveEnabledTrackerIds(ids) {
        try {
          localStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(ids));
        } catch {
          // Ignore localStorage write error
        }
      }

      function getCachedHealth() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_HEALTH);
          if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data.checkedAt === 'number' && data.statusMap) {
              if (Date.now() - data.checkedAt < HEALTH_CACHE_TTL_MS) {
                return data;
              }
            }
          }
        } catch {
          // Ignore localStorage errors
        }
        return null;
      }

      function saveHealth(statusMap) {
        try {
          localStorage.setItem(STORAGE_KEY_HEALTH, JSON.stringify({
            checkedAt: Date.now(),
            statusMap: statusMap
          }));
        } catch {
          // Ignore localStorage write error
        }
      }

      function updateIndexerSelect() {
        const enabledIds = getEnabledTrackerIds();
        const total = availableIndexers.length;
        const activeCount = availableIndexers.filter(idx => enabledIds.includes(idx.id)).length;

        const prevSelected = indexerSelect.value;
        indexerSelect.innerHTML = '';

        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All Trackers (' + activeCount + '/' + total + ' active)';
        indexerSelect.appendChild(allOpt);

        availableIndexers.forEach(idx => {
          const opt = document.createElement('option');
          opt.value = idx.id;
          const isEnabled = enabledIds.includes(idx.id);
          opt.textContent = idx.name + ' (' + (idx.type || 'public') + ')' + (!isEnabled ? ' [disabled]' : '');
          indexerSelect.appendChild(opt);
        });

        if (prevSelected && Array.from(indexerSelect.options).some(o => o.value === prevSelected)) {
          indexerSelect.value = prevSelected;
        } else {
          indexerSelect.value = 'all';
        }

        const summaryCountEl = document.getElementById('tracker-summary-count');
        if (summaryCountEl) {
          summaryCountEl.textContent = activeCount + ' of ' + total + ' enabled';
        }

        const toggleAllBtn = document.getElementById('btn-toggle-all');
        if (toggleAllBtn) {
          toggleAllBtn.textContent = activeCount === total ? 'Deselect All' : 'Select All';
        }
      }

      function handleTrackerToggle(trackerId, isChecked) {
        let enabledIds = getEnabledTrackerIds();
        if (isChecked) {
          if (!enabledIds.includes(trackerId)) enabledIds.push(trackerId);
        } else {
          enabledIds = enabledIds.filter(id => id !== trackerId);
        }
        saveEnabledTrackerIds(enabledIds);
        updateIndexerSelect();
      }

      function toggleAllTrackers() {
        const enabledIds = getEnabledTrackerIds();
        const total = availableIndexers.length;
        const allEnabled = enabledIds.length === total;
        const newEnabled = allEnabled ? [] : availableIndexers.map(i => i.id);
        saveEnabledTrackerIds(newEnabled);

        const health = currentStatusMap || getCachedHealth()?.statusMap;
        renderTrackerTable(availableIndexers, health);
      }

      function disableOfflineTrackers() {
        const statusMap = currentStatusMap || getCachedHealth()?.statusMap;
        if (!statusMap) return;
        let enabledIds = getEnabledTrackerIds();
        let disabledCount = 0;

        availableIndexers.forEach(idx => {
          if (statusMap[idx.name] === false) {
            if (enabledIds.includes(idx.id)) {
              disabledCount++;
              enabledIds = enabledIds.filter(id => id !== idx.id);
            }
          }
        });

        saveEnabledTrackerIds(enabledIds);
        renderTrackerTable(availableIndexers, statusMap);
        showToast('Disabled ' + disabledCount + ' offline tracker' + (disabledCount === 1 ? '' : 's'));
      }

      async function fetchIndexers() {
        try {
          const res = await fetch('/api/v2.0/indexers');
          if (!res.ok) return;
          const indexers = await res.json();
          availableIndexers = indexers;

          const cachedHealth = getCachedHealth();
          if (cachedHealth) {
            currentStatusMap = cachedHealth.statusMap;
            renderTrackerTable(indexers, cachedHealth.statusMap);
          } else {
            renderTrackerTable(indexers);
          }
        } catch {
          // Ignore indexer fetch error on load
        }
      }

      function renderTrackerTable(indexers, statusMap) {
        const tbody = document.getElementById('tracker-table-body');
        if (!indexers || indexers.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="tracker-empty">No indexers configured.</td></tr>';
          return;
        }

        const enabledIds = getEnabledTrackerIds();
        let hasOffline = false;

        tbody.innerHTML = indexers.map(idx => {
          const isEnabled = enabledIds.includes(idx.id);
          let statusHtml = '<span class="status-dot untested"></span><span class="tracker-status-label">Untested</span>';

          if (statusMap && typeof statusMap[idx.name] !== 'undefined') {
            const isOnline = Boolean(statusMap[idx.name]);
            if (!isOnline) hasOffline = true;
            const dotClass = isOnline ? 'online' : 'offline';
            const label = isOnline ? 'Online' : 'Offline';
            statusHtml = '<span class="status-dot ' + dotClass + '"></span>' + label;
          }

          const link = idx.site_link || (idx.links && idx.links[0]) || '';
          return '<tr>' +
            '<td>' +
              '<label class="tracker-switch" aria-label="Toggle ' + escapeHtml(idx.name) + '">' +
                '<input type="checkbox" data-tracker-id="' + escapeHtml(idx.id) + '" ' + (isEnabled ? 'checked' : '') + '>' +
                '<span class="tracker-slider"></span>' +
              '</label>' +
            '</td>' +
            '<td>' + statusHtml + '</td>' +
            '<td><strong>' + escapeHtml(idx.name) + '</strong></td>' +
            '<td><span class="tracker-type">' + escapeHtml(idx.type || 'public') + '</span></td>' +
            '<td><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer" class="tracker-link">' + escapeHtml(link) + '</a></td>' +
          '</tr>';
        }).join('');

        const disableOfflineBtn = document.getElementById('btn-disable-offline');
        if (disableOfflineBtn) {
          disableOfflineBtn.classList.toggle('is-hidden', !hasOffline);
        }

        updateIndexerSelect();
      }

      async function checkTrackerAvailability() {
        const btn = document.getElementById('btn-check-trackers');
        btn.disabled = true;
        btn.textContent = 'Testing...';
        try {
          const res = await fetch('/api/v2.0/indexers/status');
          if (res.ok) {
            const data = await res.json();
            const statusMap = Array.isArray(data) ? data[0] : data;
            currentStatusMap = statusMap;
            saveHealth(statusMap);
            renderTrackerTable(availableIndexers, statusMap);
            showToast('Tracker health checks completed');
          }
        } catch {
          showToast('Failed to reach trackers status endpoint');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg> Check Availability';
        }
      }

      async function performSearch() {
        const query = queryInput.value.trim();
        const selectedIndexer = indexerSelect.value || 'all';

        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (activeCategory) params.append('category', activeCategory);

        if (selectedIndexer === 'all') {
          const enabledIds = getEnabledTrackerIds();
          if (enabledIds.length === 0) {
            renderError('No trackers are currently enabled. Please enable at least one tracker in settings.');
            return;
          }
          if (enabledIds.length < availableIndexers.length) {
            enabledIds.forEach(id => params.append('Tracker[]', id));
          }
        }

        renderLoading();

        const url = '/api/v2.0/indexers/' + encodeURIComponent(selectedIndexer) + '/results?' + params.toString();

        const startTime = Date.now();
        try {
          const res = await fetch(url);
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Search request failed' }));
            renderError(err.message || 'Upstream search error occurred');
            return;
          }

          const data = await res.json();
          const elapsedMs = Date.now() - startTime;
          currentResults = data.Results || [];
          renderIndexerWarnings(data.Indexers || []);
          sortAndRenderResults(elapsedMs);
        } catch (err) {
          renderError(err instanceof Error ? err.message : 'Network error communicating with gateway');
        }
      }

      function sortAndRenderResults(elapsedMs) {
        activeResultIndex = -1;
        const sortMode = sortSelect.value;

        currentResults.sort((a, b) => {
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
        resultsStats.innerHTML = 'Found <strong>' + currentResults.length + '</strong> releases' + elapsedText;

        if (currentResults.length === 0) {
          resultsList.innerHTML =
            '<div class="empty-state">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
              '<h3>No releases found</h3>' +
              '<p>Try adjusting your search terms or selecting a different category filter.</p>' +
            '</div>';
          return;
        }

        resultsList.innerHTML = currentResults.map((item, idx) => {
          const formattedSize = formatBytes(item.Size);
          const dateStr = item.PublishDate ? item.PublishDate.slice(0, 10) : '';
          const hasMagnet = Boolean(item.MagnetUri) || Boolean(getMagnetEndpoint(item));
          const hasDownload = Boolean(item.Link) && isSafeUrl(item.Link, false);

          const magnetBtn = hasMagnet
            ? '<button type="button" class="action-btn magnet-btn btn-copy-magnet" data-index="' + idx + '" title="' + (item.MagnetUri ? 'Copy Magnet URI' : 'Get magnet URI from .torrent file') + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 3v7a6 6 0 0 0 12 0V3"></path><line x1="2" y1="7" x2="6" y2="7"></line><line x1="18" y1="7" x2="22" y2="7"></line></svg> Magnet</button>'
            : '<button type="button" class="action-btn" disabled title="No magnet available">Magnet</button>';

          const downloadBtn = hasDownload
            ? '<a href="' + escapeHtml(item.Link) + '" class="action-btn" download title="Download .torrent file"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> .torrent</a>'
            : '';

          return '<div class="torrent-card" data-index="' + idx + '">' +
            '<div class="torrent-main">' +
              '<div class="torrent-title">' + escapeHtml(item.Title) + '</div>' +
              '<div class="torrent-meta">' +
                '<span class="badge badge-tracker">' + escapeHtml(item.Tracker) + '</span>' +
                '<span class="badge badge-category">' + escapeHtml(item.CategoryDesc || 'Other') + '</span>' +
                '<span class="meta-stat stat-size">' + formattedSize + '</span>' +
                '<span class="meta-stat stat-seed">▲ ' + item.Seeders + '</span>' +
                '<span class="meta-stat stat-leech">▼ ' + item.Peers + '</span>' +
                (dateStr ? '<span class="meta-stat">📅 ' + escapeHtml(dateStr) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="torrent-actions">' +
              magnetBtn +
              downloadBtn +
              '<button type="button" class="action-btn btn-view-details" data-index="' + idx + '" title="View Topic Details">Info</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      function renderIndexerWarnings(indexers) {
        const failed = indexers.filter(idx => idx && idx.Error);
        indexerWarnings.replaceChildren();
        indexerWarnings.hidden = failed.length === 0;
        if (failed.length === 0) return;

        const heading = document.createElement('div');
        heading.textContent = failed.length === 1
          ? '1 tracker could not be searched:'
          : failed.length + ' trackers could not be searched:';
        const list = document.createElement('ul');
        failed.forEach(idx => {
          const item = document.createElement('li');
          const name = document.createElement('strong');
          name.textContent = idx.Name || idx.ID;
          item.append(name, ' — ' + idx.Error);
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
            '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
            '<h3>Search failed</h3>' +
            '<p>' + escapeHtml(message) + '</p>' +
          '</div>';
      }

      function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function isSafeUrl(url, allowMagnet) {
        if (!url || typeof url !== 'string') return false;
        try {
          const parsed = new URL(url, window.location.origin);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true;
          if (allowMagnet && parsed.protocol === 'magnet:') return true;
          return false;
        } catch {
          return false;
        }
      }

      // Service Worker & PWA Install
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
      }

      let deferredInstallPrompt = null;
      const installBtn = document.getElementById('btn-install-app');

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installBtn) {
          installBtn.classList.remove('is-hidden');
        }
      });

      const isIosDevice = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      const isStandaloneApp =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean(window.navigator.standalone);

      if (isIosDevice && !isStandaloneApp && installBtn) {
        installBtn.classList.remove('is-hidden');
      }

      if (installBtn) {
        installBtn.addEventListener('click', async () => {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              installBtn.classList.add('is-hidden');
              showToast('TorrGate installed successfully!');
            }
            deferredInstallPrompt = null;
          } else if (isIosDevice) {
            showToast('To install: tap Share in Safari, then "Add to Home Screen"');
          }
        });
      }

      window.addEventListener('appinstalled', () => {
        if (installBtn) {
          installBtn.classList.add('is-hidden');
        }
        showToast('TorrGate installed as an application!');
      });
    })();`;
