// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const WEB_CLIENT_STYLES = String.raw`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .is-hidden { display: none !important; }
    .indexer-warnings {
      margin: 0 0 var(--section-gap);
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--danger);
      border-radius: var(--card-radius);
      background: var(--surface);
      color: var(--text-muted);
      font-size: 13px;
    }
    .indexer-warnings[hidden] { display: none; }
    .indexer-warnings ul { list-style: none; margin-top: 4px; }
    .indexer-warnings li { overflow-wrap: anywhere; }
    .indexer-warnings strong { color: var(--text); }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    button, input, select { font-family: inherit; font-size: inherit; color: inherit; }

    /* Header */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      height: calc(var(--header-height) + var(--section-gap));
      padding: var(--section-gap) 20px 0;
      background: var(--bg);
    }
    .header-inner {
      height: 100%;
      max-width: calc(var(--content-width) - 40px);
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--card-radius);
      box-shadow: 0 8px 24px var(--card-shadow);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.3px;
    }
    .brand-logo {
      width: 24px;
      height: 24px;
      flex: none;
      color: var(--accent);
    }
    .brand-badge {
      font-size: 11px;
      font-weight: 500;
      background: var(--surface-elevated);
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .nav-btn:hover {
      background: var(--surface-elevated);
      color: var(--text);
      border-color: var(--border-hover);
    }
    .nav-btn.primary {
      background: var(--accent);
      color: var(--accent-text);
      border-color: var(--accent);
      font-weight: 600;
      box-shadow: 0 2px 8px var(--accent-glow);
    }
    .nav-btn.primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      color: var(--accent-text);
    }
    .btn-install {
      background: var(--surface-elevated);
      color: var(--accent);
      border-color: var(--accent-border);
    }
    .btn-install:hover {
      background: var(--accent-bg-subtle);
      border-color: var(--accent);
    }
    /* Main Container */
    main {
      flex: 1;
      width: 100%;
      max-width: var(--content-width);
      margin: 0 auto;
      padding: var(--section-gap) 20px 48px;
    }

    /* Search Section */
    .search-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--card-radius);
      padding: 20px;
      margin-bottom: var(--section-gap);
      box-shadow: 0 8px 24px var(--card-shadow);
    }
    .search-inputs {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-bar-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-shortcut-hint {
      position: absolute;
      right: 14px;
      pointer-events: none;
      opacity: 0.6;
      transition: opacity 0.15s ease;
    }
    .search-bar-wrap:focus-within .search-shortcut-hint {
      opacity: 0;
    }
    .search-bar-wrap svg {
      position: absolute;
      left: 14px;
      color: var(--text-muted);
      pointer-events: none;
    }
    .search-bar-wrap input {
      width: 100%;
      height: 44px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0 14px 0 42px;
      color: var(--text);
      font-size: 15px;
      transition: all 0.15s ease;
    }
    .search-bar-wrap input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    .indexer-select {
      min-width: 180px;
      height: 44px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0 14px;
      color: var(--text);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
      transition: all 0.15s ease;
    }
    .indexer-select:focus {
      outline: none;
      border-color: var(--accent);
    }
    .btn-search {
      height: 44px;
      padding: 0 24px;
      background: var(--button-bg);
      color: var(--button-text);
      font-weight: 600;
      font-size: 14px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
      box-shadow: 0 4px 12px var(--button-shadow);
      flex-shrink: 0;
    }
    .btn-search:hover {
      background: var(--button-hover);
      color: var(--button-text);
    }

    /* Category Filter Pills */
    .filter-pills {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: thin;
    }
    .pill {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 5px 13px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .pill:hover {
      background: var(--surface-elevated);
      color: var(--text);
      border-color: var(--border-hover);
    }
    .pill.active {
      background: rgba(99, 102, 241, 0.15);
      color: var(--shortcut-text);
      border-color: rgba(99, 102, 241, 0.35);
    }

    /* Results Bar */
    .results-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--section-gap);
      padding: 0 4px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .results-stats strong {
      color: var(--text);
    }
    .sort-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sort-select {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--text);
      cursor: pointer;
    }

    .tracker-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tracker-summary {
      font-size: 13px;
      color: var(--text-muted);
    }
    .tracker-toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .tracker-toolbar-button {
      font-size: 12px;
      padding: 4px 10px;
    }
    .tracker-disable-offline {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.4);
    }
    .tracker-active-column { width: 50px; }
    .tracker-loading {
      text-align: center;
      color: var(--text-muted);
    }
    .integration-description {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .integration-categories {
      font-size: 12px;
      color: var(--subtle-text);
      line-height: 1.5;
    }
    .shortcut-heading {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .shortcut-keyword {
      color: var(--text-dim);
      font-size: 11px;
    }
    .shortcut-group-spaced { margin-top: 16px; }

    /* Results List */
    .results-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .torrent-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 16px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .torrent-card:hover {
      background: var(--surface-elevated);
      border-color: var(--border-hover);
    }
    .torrent-card.active-card {
      background: var(--surface-elevated);
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .torrent-main {
      min-width: 0;
    }
    .torrent-title {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--strong-text);
      line-height: 1.4;
      margin-bottom: 8px;
      word-break: break-word;
    }
    .torrent-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .badge-tracker {
      background: rgba(99, 102, 241, 0.12);
      color: var(--badge-tracker-text);
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .badge-category {
      background: rgba(56, 189, 248, 0.12);
      color: var(--badge-category-text);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .meta-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .stat-seed { color: var(--seed-color); font-weight: 600; }
    .stat-leech { color: var(--leech-color); font-weight: 500; }
    .stat-size { color: var(--size-text); font-weight: 500; }

    .torrent-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .action-btn:hover {
      background: var(--surface-elevated);
      color: var(--text);
      border-color: var(--border-hover);
    }
    .action-btn.magnet-btn {
      background: rgba(99, 102, 241, 0.1);
      border-color: rgba(99, 102, 241, 0.3);
      color: var(--shortcut-text);
    }
    .action-btn.magnet-btn:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-text);
    }
    .action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Empty and Loading States */
    .empty-state {
      text-align: center;
      padding: 64px 20px;
      background: var(--surface);
      border: 1px dashed var(--border);
      border-radius: var(--card-radius);
    }
    .empty-state svg {
      width: 44px;
      height: 44px;
      color: var(--text-dim);
      margin-bottom: 14px;
    }
    .empty-state h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    .empty-state p {
      font-size: 13px;
      color: var(--text-muted);
      max-width: 440px;
      margin: 0 auto;
    }

    .skeleton-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .skeleton-line {
      height: 14px;
      background: linear-gradient(90deg, var(--skeleton-edge) 25%, var(--skeleton-middle) 50%, var(--skeleton-edge) 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
      border-radius: 4px;
    }
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Modal System */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: var(--modal-overlay);
      backdrop-filter: blur(6px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .modal-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      width: 100%;
      max-width: 620px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 48px var(--modal-shadow);
      transform: translateY(12px) scale(0.98);
      transition: transform 0.2s ease;
    }
    .modal-overlay.open .modal {
      transform: translateY(0) scale(1);
    }
    .modal-header {
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--strong-text);
    }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }
    .modal-close:hover { color: var(--text); background: var(--surface-elevated); }
    .modal-body {
      padding: 22px;
      overflow-y: auto;
    }
    .modal-footer {
      padding: 14px 22px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Integration & Trackers styling */
    .integration-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .integration-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .copy-input-row {
      display: flex;
      gap: 8px;
    }
    .copy-input {
      flex: 1;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--size-text);
    }
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tracker-table {
      width: 100%;
      min-width: 480px;
      border-collapse: collapse;
      font-size: 13px;
    }
    .tracker-table th, .tracker-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .tracker-table th {
      color: var(--text-muted);
      font-weight: 500;
      font-size: 12px;
    }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #71717a;
      margin-right: 6px;
    }
    .status-dot.online { background: #10b981; box-shadow: 0 0 6px #10b981; }
    .status-dot.offline { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
    .status-dot.untested { background: #71717a; }

    /* Switch toggle */
    .tracker-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 32px;
      height: 18px;
    }
    .tracker-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .tracker-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border);
      transition: background-color 0.2s ease;
      border-radius: 18px;
    }
    .tracker-slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background-color: #fafafa;
      transition: transform 0.2s ease;
      border-radius: 50%;
    }
    .tracker-switch input:checked + .tracker-slider {
      background-color: var(--accent);
    }
    .tracker-switch input:checked + .tracker-slider:before {
      transform: translateX(14px);
    }
    .tracker-switch input:focus-visible + .tracker-slider {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: monospace;
      font-weight: 600;
      color: var(--text-main);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
    }
    .shortcut-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 0;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    .shortcut-row:last-child {
      border-bottom: none;
    }
    .shortcut-desc {
      color: var(--text-main);
    }
    .shortcut-keys {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toast.closing {
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(10px);
    }
    .details-empty-magnet {
      color: var(--text-dim);
      font-size: 13px;
    }
    .details-info-hash {
      margin-bottom: 12px;
      font-size: 13px;
    }
    .details-info-hash strong { color: var(--text-muted); }
    .details-info-hash code {
      font-family: monospace;
      color: var(--subtle-text);
    }
    .details-topic-link {
      display: inline-flex;
      margin-top: 10px;
    }
    .details-actions {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .tracker-empty { text-align: center; }
    .tracker-status-label { color: var(--text-muted); }
    .tracker-type {
      text-transform: capitalize;
      color: var(--text-muted);
    }
    .tracker-link {
      color: var(--accent);
      text-decoration: underline;
    }
    .skeleton-line-wide { width: 70%; }
    .skeleton-line-short {
      width: 40%;
      height: 10px;
    }
    .empty-state.error { border-color: rgba(239, 68, 68, 0.3); }
    .empty-state.error p { color: var(--error-text); }

    /* Toast Notification */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 200;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--strong-text);
      box-shadow: 0 10px 25px var(--toast-shadow);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: toast-in 0.25s ease-out;
    }
    @keyframes toast-in {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    @media (max-width: 768px) {
      :root {
        --section-gap: 16px;
      }
      header {
        padding-right: 12px;
        padding-left: 12px;
      }
      .header-inner {
        padding: 0 12px;
      }
      main {
        padding: var(--section-gap) 12px 36px;
      }
      .search-panel {
        padding: 16px;
      }
      .search-inputs {
        flex-direction: column;
      }
      .indexer-select {
        width: 100%;
      }
      .btn-search {
        width: 100%;
      }
      .torrent-card {
        grid-template-columns: 1fr;
        padding: 14px;
      }
      .torrent-actions {
        justify-content: flex-start;
      }
      .modal {
        max-height: 90vh;
      }
      .modal-body {
        padding: 16px;
      }
    }

    @media (max-width: 900px) {
      .header-right {
        gap: 6px;
      }
      .nav-btn span:not(#theme-toggle-icon) {
        display: none;
      }
      .nav-btn {
        padding: 8px 10px;
      }
    }

    @media (max-width: 600px) {
      .brand-badge {
        display: none;
      }
      .results-bar {
        flex-direction: column;
        align-items: flex-start;
      }
      .sort-wrap {
        width: 100%;
        justify-content: space-between;
      }
      .toast-container {
        left: 16px;
        right: 16px;
        bottom: 16px;
      }
      .toast {
        width: 100%;
        justify-content: center;
      }
    }

    @media (max-width: 480px) {
      header {
        height: auto;
      }
      .header-inner {
        flex-wrap: wrap;
        gap: 8px;
        height: auto;
        min-height: var(--header-height);
        padding-bottom: 10px;
        padding-top: 10px;
      }
      .header-left {
        flex: 1 1 100%;
        justify-content: center;
      }
      .header-right {
        flex: 1 1 100%;
        flex-wrap: wrap;
        justify-content: center;
      }
    }`;
