// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const TRACKERS_SCRIPT = String.raw`
function createTrackers({ escapeHtml, indexerSelect, showToast, state }) {
  const STORAGE_KEY_ENABLED = 'torrgate_enabled_trackers';
  const STORAGE_KEY_HEALTH = 'torrgate_tracker_health';
  const HEALTH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
    return state.availableIndexers.map(indexer => indexer.id);
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
    const total = state.availableIndexers.length;
    const activeCount = state.availableIndexers.filter(indexer => enabledIds.includes(indexer.id)).length;

    const previousIndexerId = indexerSelect.value;
    indexerSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Trackers (' + activeCount + '/' + total + ' active)';
    indexerSelect.appendChild(allOption);

    state.availableIndexers.forEach(indexer => {
      const option = document.createElement('option');
      option.value = indexer.id;
      const isEnabled = enabledIds.includes(indexer.id);
      option.textContent = indexer.name + ' (' + (indexer.type || 'public') + ')' + (!isEnabled ? ' [disabled]' : '');
      indexerSelect.appendChild(option);
    });

    if (previousIndexerId && Array.from(indexerSelect.options).some(option => option.value === previousIndexerId)) {
      indexerSelect.value = previousIndexerId;
    } else {
      indexerSelect.value = 'all';
    }

    const summaryCountElement = document.getElementById('tracker-summary-count');
    if (summaryCountElement) {
      summaryCountElement.textContent = activeCount + ' of ' + total + ' enabled';
    }

    const toggleAllButton = document.getElementById('btn-toggle-all');
    if (toggleAllButton) {
      toggleAllButton.textContent = activeCount === total ? 'Deselect All' : 'Select All';
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
    const areAllTrackersEnabled = state.availableIndexers.every(indexer => enabledIds.includes(indexer.id));
    const nextEnabledIds = areAllTrackersEnabled ? [] : state.availableIndexers.map(indexer => indexer.id);
    saveEnabledTrackerIds(nextEnabledIds);

    const health = state.currentStatusMap || getCachedHealth()?.statusMap;
    renderTrackerTable(state.availableIndexers, health);
  }

  function disableOfflineTrackers() {
    const statusMap = state.currentStatusMap || getCachedHealth()?.statusMap;
    if (!statusMap) return;
    let enabledIds = getEnabledTrackerIds();
    let disabledCount = 0;

    state.availableIndexers.forEach(indexer => {
      if (statusMap[indexer.name] === false) {
        if (enabledIds.includes(indexer.id)) {
          disabledCount++;
          enabledIds = enabledIds.filter(id => id !== indexer.id);
        }
      }
    });

    saveEnabledTrackerIds(enabledIds);
    renderTrackerTable(state.availableIndexers, statusMap);
    showToast('Disabled ' + disabledCount + ' offline tracker' + (disabledCount === 1 ? '' : 's'));
  }

  async function fetchIndexers() {
    try {
      const res = await fetch('/api/v2.0/indexers');
      if (!res.ok) return;
      const indexers = await res.json();
      state.availableIndexers = indexers;

      const cachedHealth = getCachedHealth();
      if (cachedHealth) {
        state.currentStatusMap = cachedHealth.statusMap;
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

    tbody.innerHTML = indexers.map(indexer => {
      const isEnabled = enabledIds.includes(indexer.id);
      let statusHtml = '<span class="status-dot untested"></span><span class="tracker-status-label">Untested</span>';

      if (statusMap && typeof statusMap[indexer.name] !== 'undefined') {
        const isOnline = Boolean(statusMap[indexer.name]);
        if (!isOnline) hasOffline = true;
        const dotClass = isOnline ? 'online' : 'offline';
        const label = isOnline ? 'Online' : 'Offline';
        statusHtml = '<span class="status-dot ' + dotClass + '"></span>' + label;
      }

      const link = indexer.site_link;
      return '<tr>' +
        '<td>' +
          '<label class="tracker-switch" aria-label="Toggle ' + escapeHtml(indexer.name) + '">' +
            '<input type="checkbox" data-tracker-id="' + escapeHtml(indexer.id) + '" ' + (isEnabled ? 'checked' : '') + '>' +
            '<span class="tracker-slider"></span>' +
          '</label>' +
        '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td><strong>' + escapeHtml(indexer.name) + '</strong></td>' +
        '<td><span class="tracker-type">' + escapeHtml(indexer.type || 'public') + '</span></td>' +
        '<td><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer" class="tracker-link">' + escapeHtml(link) + '</a></td>' +
      '</tr>';
    }).join('');

    const disableOfflineButton = document.getElementById('btn-disable-offline');
    if (disableOfflineButton) {
      disableOfflineButton.classList.toggle('is-hidden', !hasOffline);
    }

    updateIndexerSelect();
  }

  async function checkTrackerAvailability() {
    const checkButton = document.getElementById('btn-check-trackers');
    checkButton.disabled = true;
    checkButton.textContent = 'Testing...';
    try {
      const res = await fetch('/api/v2.0/indexers/status');
      if (res.ok) {
        const [statusMap] = await res.json();
        state.currentStatusMap = statusMap;
        saveHealth(statusMap);
        renderTrackerTable(state.availableIndexers, statusMap);
        showToast('Tracker health checks completed');
      }
    } catch {
      showToast('Failed to reach trackers status endpoint');
    } finally {
      checkButton.disabled = false;
      checkButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg> Check Availability';
    }
  }

  return { checkTrackerAvailability, disableOfflineTrackers, fetchIndexers, getEnabledTrackerIds, handleTrackerToggle, toggleAllTrackers };
}
`;
