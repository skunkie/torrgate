// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const WEB_CLIENT_STYLES = String.raw`
    * { box-sizing: border-box; padding: 0; margin: 0; }
    .is-hidden { display: none !important; }
    .indexer-warnings {
      padding: 10px 14px;
      margin: 0 0 var(--section-gap);
      font-size: 13px;
      color: var(--text-muted);
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--danger);
      border-radius: var(--card-radius);
    }
    .indexer-warnings[hidden] { display: none; }
    .indexer-warnings ul { margin-top: 4px; list-style: none; }
    .indexer-warnings li { overflow-wrap: anywhere; }
    .indexer-warnings strong { color: var(--text); }
    body {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      overflow-x: hidden;
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
      color: var(--text);
      background: var(--bg);
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: calc(var(--content-width) - 40px);
      height: 100%;
      padding: 0 20px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--card-radius);
      box-shadow: 0 8px 24px var(--card-shadow);
    }
    .header-left {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .brand {
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .brand-logo {
      flex: none;
      width: 24px;
      height: 24px;
      color: var(--accent);
    }
    .brand-badge {
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 999px;
    }
    .header-right {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .nav-btn {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: all 0.15s ease;
    }
    .nav-btn:hover {
      color: var(--text);
      background: var(--surface-elevated);
      border-color: var(--border-hover);
    }
    .nav-btn.primary {
      font-weight: 600;
      color: var(--accent-text);
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 2px 8px var(--accent-glow);
    }
    .nav-btn.primary:hover {
      color: var(--accent-text);
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }
    .btn-install {
      color: var(--accent);
      background: var(--surface-elevated);
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
      padding: var(--section-gap) 20px 48px;
      margin: 0 auto;
    }

    /* Search Section */
    .search-panel {
      padding: 20px;
      margin-bottom: var(--section-gap);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--card-radius);
      box-shadow: 0 8px 24px var(--card-shadow);
    }
    .search-inputs {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-bar-wrap {
      position: relative;
      display: flex;
      flex: 1;
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
      padding: 0 14px 0 42px;
      font-size: 15px;
      color: var(--text);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
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
      padding: 0 14px;
      padding-right: 36px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
      background: var(--bg);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      border: 1px solid var(--border);
      border-radius: 10px;
      transition: all 0.15s ease;
    }
    .indexer-select:focus {
      outline: none;
      border-color: var(--accent);
    }
    .btn-search {
      display: inline-flex;
      flex-shrink: 0;
      gap: 8px;
      align-items: center;
      justify-content: center;
      height: 44px;
      padding: 0 24px;
      font-size: 14px;
      font-weight: 600;
      color: var(--button-text);
      cursor: pointer;
      background: var(--button-bg);
      border: none;
      border-radius: 10px;
      box-shadow: 0 4px 12px var(--button-shadow);
      transition: all 0.15s ease;
    }
    .btn-search:hover {
      color: var(--button-text);
      background: var(--button-hover);
    }

    /* Category Filter Pills */
    .filter-pills {
      display: flex;
      gap: 8px;
      align-items: center;
      padding-bottom: 4px;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .pill {
      padding: 5px 13px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      white-space: nowrap;
      cursor: pointer;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      transition: all 0.15s ease;
    }
    .pill:hover {
      color: var(--text);
      background: var(--surface-elevated);
      border-color: var(--border-hover);
    }
    .pill.active {
      color: var(--shortcut-text);
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.35);
    }

    /* Results Bar */
    .results-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
      margin-bottom: var(--section-gap);
      font-size: 13px;
      color: var(--text-muted);
    }
    .results-stats strong {
      color: var(--text);
    }
    .sort-wrap {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .sort-select {
      padding: 4px 10px;
      font-size: 12px;
      color: var(--text);
      cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
    }

    .tracker-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
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
      padding: 4px 10px;
      font-size: 12px;
    }
    .tracker-disable-offline {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.4);
    }
    .tracker-active-column { width: 50px; }
    .tracker-loading {
      color: var(--text-muted);
      text-align: center;
    }
    .integration-description {
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .integration-categories {
      font-size: 12px;
      line-height: 1.5;
      color: var(--subtle-text);
    }
    .shortcut-heading {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .shortcut-keyword {
      font-size: 11px;
      color: var(--text-dim);
    }
    .shortcut-group-spaced { margin-top: 16px; }

    /* Results List */
    .results-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .torrent-card {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
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
      margin-bottom: 8px;
      font-size: 14.5px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--strong-text);
      word-break: break-word;
    }
    .torrent-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
      font-size: 12px;
      color: var(--text-muted);
    }
    .badge {
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      border-radius: 4px;
    }
    .badge-tracker {
      color: var(--badge-tracker-text);
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .badge-category {
      color: var(--badge-category-text);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .meta-stat {
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
    .stat-seed { font-weight: 600; color: var(--seed-color); }
    .stat-leech { font-weight: 500; color: var(--leech-color); }
    .stat-size { font-weight: 500; color: var(--size-text); }

    .torrent-actions {
      display: flex;
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .action-btn {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      justify-content: center;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      white-space: nowrap;
      cursor: pointer;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 7px;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      color: var(--text);
      background: var(--surface-elevated);
      border-color: var(--border-hover);
    }
    .action-btn.magnet-btn {
      color: var(--shortcut-text);
      background: rgba(99, 102, 241, 0.1);
      border-color: rgba(99, 102, 241, 0.3);
    }
    .action-btn.magnet-btn:hover {
      color: var(--accent-text);
      background: var(--accent);
      border-color: var(--accent);
    }
    .action-btn:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    /* Empty and Loading States */
    .empty-state {
      padding: 64px 20px;
      text-align: center;
      background: var(--surface);
      border: 1px dashed var(--border);
      border-radius: var(--card-radius);
    }
    .empty-state svg {
      width: 44px;
      height: 44px;
      margin-bottom: 14px;
      color: var(--text-dim);
    }
    .empty-state h3 {
      margin-bottom: 6px;
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }
    .empty-state p {
      max-width: 440px;
      margin: 0 auto;
      font-size: 13px;
      color: var(--text-muted);
    }

    .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .skeleton-line {
      height: 14px;
      background: linear-gradient(90deg, var(--skeleton-edge) 25%, var(--skeleton-middle) 50%, var(--skeleton-edge) 75%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: skeleton-shimmer 1.5s infinite;
    }
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Modal System */
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      pointer-events: none;
      background: var(--modal-overlay);
      opacity: 0;
      backdrop-filter: blur(6px);
      transition: opacity 0.2s ease;
    }
    .modal-overlay.open {
      pointer-events: auto;
      opacity: 1;
    }
    .modal {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 620px;
      max-height: 85vh;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 24px 48px var(--modal-shadow);
      transform: translateY(12px) scale(0.98);
      transition: transform 0.2s ease;
    }
    .modal-overlay.open .modal {
      transform: translateY(0) scale(1);
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
    }
    .modal-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--strong-text);
    }
    .modal-close {
      padding: 4px;
      color: var(--text-muted);
      cursor: pointer;
      background: none;
      border: none;
      border-radius: 6px;
    }
    .modal-close:hover { color: var(--text); background: var(--surface-elevated); }
    .modal-body {
      padding: 22px;
      overflow-y: auto;
    }
    .modal-footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 14px 22px;
      border-top: 1px solid var(--border);
    }

    /* Integration & Trackers styling */
    .integration-box {
      padding: 14px;
      margin-bottom: 14px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .integration-label {
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .copy-input-row {
      display: flex;
      gap: 8px;
    }
    .copy-input {
      flex: 1;
      padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--size-text);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .tracker-table {
      width: 100%;
      min-width: 480px;
      font-size: 13px;
      border-collapse: collapse;
    }
    .tracker-table th, .tracker-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .tracker-table th {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 6px;
      background: #71717a;
      border-radius: 50%;
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
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
    }
    .tracker-slider {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      cursor: pointer;
      background-color: var(--border);
      border-radius: 18px;
      transition: background-color 0.2s ease;
    }
    .tracker-slider:before {
      position: absolute;
      bottom: 3px;
      left: 3px;
      width: 12px;
      height: 12px;
      content: "";
      background-color: #fafafa;
      border-radius: 50%;
      transition: transform 0.2s ease;
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
      font-family: monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-main);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
    }
    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
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
      gap: 4px;
      align-items: center;
    }

    .toast.closing {
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .details-empty-magnet {
      font-size: 13px;
      color: var(--text-dim);
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
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }
    .tracker-empty { text-align: center; }
    .tracker-status-label { color: var(--text-muted); }
    .tracker-type {
      color: var(--text-muted);
      text-transform: capitalize;
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
      right: 24px;
      bottom: 24px;
      z-index: 200;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--strong-text);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 10px 25px var(--toast-shadow);
      animation: toast-in 0.25s ease-out;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(100%); }
      to { opacity: 1; transform: translateY(0); }
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
        justify-content: space-between;
        width: 100%;
      }
      .toast-container {
        right: 16px;
        bottom: 16px;
        left: 16px;
      }
      .toast {
        justify-content: center;
        width: 100%;
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
        padding-top: 10px;
        padding-bottom: 10px;
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
