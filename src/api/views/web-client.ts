// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { getBrandLogoSvg, getIconLinkTags } from './pwa.js';

export interface RenderWebClientOptions {
  hasAuth: boolean;
  version?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderWebClientPage(options: RenderWebClientOptions): string {
  const versionStr = options.version ? `v${options.version}` : 'v1.0.0';
  const hasAuth = Boolean(options.hasAuth);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TorrGate &middot; Torrent Tracker Gateway &amp; Search</title>
  <meta name="description" content="Search across torrent trackers via unified Jackett and Torznab proxy">
  <link rel="manifest" href="/manifest.webmanifest">
  ${getIconLinkTags()}
  <meta name="theme-color" id="theme-color" content="#0f0f0f">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="TorrGate">
  <script src="/theme.js"></script>
  <link rel="stylesheet" href="/web-client.css">
</head>
<body>
  <!-- Top Navigation Header -->
  <header>
    <div class="header-inner">
      <div class="header-left">
        <div class="brand">
          ${getBrandLogoSvg()}
          <span>TorrGate</span>
          <span class="brand-badge">${escapeHtml(versionStr)}</span>
        </div>
      </div>
      <div class="header-right">
        <button class="nav-btn" id="btn-open-trackers" title="View Tracker Status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Trackers</span>
        </button>
        <button class="nav-btn" id="btn-open-integration" title="Connect to Radarr, Sonarr or Prowlarr">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
          <span>Connect Apps</span>
        </button>
        <button type="button" class="nav-btn" id="theme-toggle" aria-label="Toggle color theme">
          <span id="theme-toggle-icon" aria-hidden="true">◐</span>
          <span id="theme-toggle-label">Theme</span>
        </button>
        <button class="nav-btn btn-install is-hidden" id="btn-install-app" title="Install TorrGate App">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Install</span>
        </button>
        <a href="/docs" class="nav-btn" title="Open API Documentation">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>API Docs</span>
        </a>
        <button class="nav-btn" id="btn-open-shortcuts" title="Keyboard Shortcuts (?)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Shortcuts</span>
        </button>
        ${
          hasAuth
            ? `<a href="/logout" class="nav-btn" title="Sign out of TorrGate">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>Sign Out</span>
              </a>`
            : ''
        }
      </div>
    </div>
  </header>

  <!-- Main Content Area -->
  <main>
    <div class="search-panel">
      <form id="search-form" class="search-inputs">
        <div class="search-bar-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            id="query-input"
            name="query"
            placeholder="Search releases, movies, shows, games across trackers..."
            autocomplete="off"
            autofocus
          >
          <span class="search-shortcut-hint"><kbd>/</kbd></span>
        </div>
        <select id="indexer-select" class="indexer-select" aria-label="Select tracker indexer">
          <option value="all">All Trackers</option>
        </select>
        <button type="submit" class="btn-search" id="btn-submit-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Search
        </button>
      </form>

      <!-- Category Filter Pills -->
      <div class="filter-pills" id="category-pills">
        <button type="button" class="pill active" data-category="">All Categories</button>
        <button type="button" class="pill" data-category="2000">🎬 Movies</button>
        <button type="button" class="pill" data-category="5000">📺 TV / Series</button>
        <button type="button" class="pill" data-category="3000">🎵 Audio</button>
        <button type="button" class="pill" data-category="4000">🎮 PC &amp; Games</button>
        <button type="button" class="pill" data-category="7000">📚 Books</button>
      </div>
    </div>

    <!-- Results Meta Bar -->
    <div class="results-bar is-hidden" id="results-bar">
      <div class="results-stats" id="results-stats">
        Found <strong>0</strong> results
      </div>
      <div class="sort-wrap">
        <label for="sort-select">Sort by:</label>
        <select id="sort-select" class="sort-select">
          <option value="seeders-desc">Seeders (High to Low)</option>
          <option value="date-desc">Date (Newest first)</option>
          <option value="size-desc">Size (Largest first)</option>
          <option value="size-asc">Size (Smallest first)</option>
          <option value="leechers-desc">Leechers (High to Low)</option>
          <option value="title-asc">Title (A-Z)</option>
        </select>
      </div>
    </div>

    <!-- Per-tracker failures from the last search -->
    <div class="indexer-warnings" id="indexer-warnings" role="status" hidden></div>

    <!-- Results List -->
    <div id="results-list" class="results-container">
      <div class="empty-state" id="initial-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3>Ready to search</h3>
        <p>Type a release title, series, or keyword above to query all aggregated torrent trackers simultaneously.</p>
      </div>
    </div>
  </main>

  <!-- Trackers Modal -->
  <div class="modal-overlay" id="modal-trackers">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Configured Trackers</h2>
        <button type="button" class="modal-close" data-close="modal-trackers" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="tracker-toolbar">
          <span class="tracker-summary" id="tracker-summary-count">Loading trackers...</span>
          <div class="tracker-toolbar-actions">
            <button type="button" class="nav-btn tracker-toolbar-button" id="btn-toggle-all">Select All</button>
            <button type="button" class="nav-btn tracker-toolbar-button tracker-disable-offline is-hidden" id="btn-disable-offline">Disable Offline</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="tracker-table">
            <thead>
              <tr>
                <th class="tracker-active-column">Active</th>
                <th>Status</th>
                <th>Tracker</th>
                <th>Type</th>
                <th>Mirror / URL</th>
              </tr>
            </thead>
            <tbody id="tracker-table-body">
              <tr>
                <td colspan="5" class="tracker-loading">Loading trackers...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="nav-btn" id="btn-check-trackers">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <polyline points="23 20 23 14 17 14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
          Check Availability
        </button>
        <button type="button" class="nav-btn primary" data-close="modal-trackers">Done</button>
      </div>
    </div>
  </div>

  <!-- Connect Apps Modal -->
  <div class="modal-overlay" id="modal-integration">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Connect to Radarr / Sonarr / Prowlarr</h2>
        <button type="button" class="modal-close" data-close="modal-integration" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body">
        <p class="integration-description">
          TorrGate provides 100% Jackett- and Torznab-compatible feeds. Add a Torznab Custom Indexer in your application using the URLs below.
        </p>

        <div class="integration-box">
          <div class="integration-label">Aggregated Torznab Feed (All Trackers)</div>
          <div class="copy-input-row">
            <input type="text" readonly class="copy-input" id="feed-url-all">
            <button type="button" class="nav-btn btn-copy-input" data-input-id="feed-url-all">Copy</button>
          </div>
        </div>

        <div class="integration-box">
          <div class="integration-label">Individual Tracker Torznab Feed Template</div>
          <div class="copy-input-row">
            <input type="text" readonly class="copy-input" id="feed-url-indexer">
            <button type="button" class="nav-btn btn-copy-input" data-input-id="feed-url-indexer">Copy</button>
          </div>
        </div>

        <div class="integration-box">
          <div class="integration-label">Standard Torznab Categories</div>
          <p class="integration-categories">
            Movies: <code>2000</code> &middot; TV/Series: <code>5000</code> &middot; Audio: <code>3000</code> &middot; Games: <code>4000</code> &middot; Books: <code>7000</code>
          </p>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="nav-btn primary" data-close="modal-integration">Close</button>
      </div>
    </div>
  </div>

  <!-- Topic Details Modal -->
  <div class="modal-overlay" id="modal-details">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title" id="details-modal-title">Release Details</h2>
        <button type="button" class="modal-close" data-close="modal-details" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body" id="details-modal-body">
        <!-- Injected via JavaScript -->
      </div>
      <div class="modal-footer" id="details-modal-footer">
        <button type="button" class="nav-btn primary" data-close="modal-details">Close</button>
      </div>
    </div>
  </div>

  <!-- Keyboard Shortcuts Modal -->
  <div class="modal-overlay" id="modal-shortcuts">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">Keyboard Shortcuts</h2>
        <button type="button" class="modal-close" data-close="modal-shortcuts" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="shortcuts-grid">
          <div class="shortcut-group">
            <h4 class="shortcut-heading">Navigation &amp; Search</h4>
            <div class="shortcut-row"><span class="shortcut-desc">Focus search</span><span class="shortcut-keys"><kbd>/</kbd> <span class="shortcut-keyword">or</span> <kbd>Ctrl</kbd><kbd>K</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Clear search / Close modal</span><span class="shortcut-keys"><kbd>Esc</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Select next release</span><span class="shortcut-keys"><kbd>↓</kbd> <span class="shortcut-keyword">or</span> <kbd>j</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Select previous release</span><span class="shortcut-keys"><kbd>↑</kbd> <span class="shortcut-keyword">or</span> <kbd>k</kbd></span></div>
          </div>
          <div class="shortcut-group shortcut-group-spaced">
            <h4 class="shortcut-heading">Release Actions</h4>
            <div class="shortcut-row"><span class="shortcut-desc">Open details</span><span class="shortcut-keys"><kbd>Enter</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Copy magnet URI</span><span class="shortcut-keys"><kbd>m</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Download .torrent</span><span class="shortcut-keys"><kbd>d</kbd></span></div>
          </div>
          <div class="shortcut-group shortcut-group-spaced">
            <h4 class="shortcut-heading">Panels &amp; Modals</h4>
            <div class="shortcut-row"><span class="shortcut-desc">Open Trackers</span><span class="shortcut-keys"><kbd>t</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Open Connect Apps</span><span class="shortcut-keys"><kbd>i</kbd></span></div>
            <div class="shortcut-row"><span class="shortcut-desc">Show shortcuts</span><span class="shortcut-keys"><kbd>?</kbd></span></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="nav-btn primary" data-close="modal-shortcuts">Done</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div class="toast-container" id="toast-container"></div>

  <!-- Application Logic -->
  <script src="/web-client.js" defer></script>
</body>
</html>`;
}
