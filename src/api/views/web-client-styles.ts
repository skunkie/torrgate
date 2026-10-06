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
      min-height: 100dvh;
      font-family: var(--font-sans);
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
      line-height: 1.6;
      color: var(--text);
      background: var(--surface);
    }
    a { color: inherit; text-decoration: none; }
    button, input, select { font-family: inherit; font-size: inherit; color: inherit; }

    /* Header */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .header-inner {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      max-width: var(--content-width);
      min-height: 68px;
      padding: 16px 28px;
      margin: 0 auto;
    }
    .header-left {
      display: flex;
      flex-shrink: 0;
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
      padding-left: 4px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .header-right {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;
      min-width: 0;
      padding: 3px;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .header-right .nav-btn { flex-shrink: 0; width: 36px; padding: 8px; white-space: nowrap; }
    .header-right .nav-btn span:not(#theme-toggle-icon) { display: none; }
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
      padding: 28px;
      margin: 0 auto;
    }

    /* Search Section */
    .search-panel {
      margin-bottom: var(--section-gap);
    }
    .workspace-title { font-size: 16px; font-weight: 600; line-height: 1.5; }
    .category-section { margin-top: 24px; }
    .search-inputs {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 240px) auto;
      gap: 12px;
      align-items: end;
    }
    .search-bar-wrap {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
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
    .search-bar-wrap input {
      padding-right: 38px;
    }
    .indexer-select {
      padding-right: 36px;
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }
    .btn-search {
      gap: 8px;
      min-height: 40px;
    }

    /* Category Filter Pills */
    .filter-pills {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;
      min-width: 0;
      padding: 3px;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .pill {
      flex-shrink: 0;
      min-height: 32px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      white-space: nowrap;
      cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
    }
    .pill:hover {
      color: var(--text);
      background: var(--surface-elevated);
      border-color: var(--border-hover);
    }
    .pill.active {
      color: var(--accent);
      background: var(--accent-bg-subtle);
      border-color: var(--accent);
    }

    /* Results Bar */
    .results-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      font-size: 13px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    .results-stats { margin-top: 4px; font-size: 12px; }
    .results-stats strong {
      color: var(--text);
    }
    .sort-wrap {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    .sort-select {
      width: auto;
      min-height: 32px;
      padding: 5px 8px;
      font-size: 12px;
      color: var(--text);
      cursor: pointer;
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
      flex-wrap: wrap;
      gap: 8px;
    }
    .tracker-toolbar-button {
      padding: 4px 10px;
      font-size: 12px;
    }
    .tracker-disable-offline {
      color: var(--danger);
      border-color: var(--danger);
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
    }
    .torrent-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, auto);
      gap: 16px;
      align-items: center;
      padding: 18px 0;
      scroll-margin-top: 140px;
      border-bottom: 1px solid var(--border);
      transition: background-color 0.15s ease;
    }
    .torrent-card:hover {
      background: var(--surface-elevated);
    }
    .torrent-card.active-card {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
      background: var(--surface-elevated);
    }
    .torrent-main {
      min-width: 0;
    }
    .torrent-title {
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      color: var(--strong-text);
      word-break: break-word;
      overflow-wrap: anywhere;
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
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .badge-tracker {
      color: var(--text-muted);
    }
    .badge-category {
      color: var(--text-muted);
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
      max-width: 420px;
    }
    .action-btn {
      white-space: nowrap;
    }

    /* Empty and Loading States */
    .empty-state {
      padding: 64px 20px;
      text-align: center;
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
      overflow-wrap: anywhere;
    }

    .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px 0;
      border-bottom: 1px solid var(--border);
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
      visibility: hidden;
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
      visibility: visible;
      pointer-events: auto;
      opacity: 1;
    }
    .modal-overlay.foreground { z-index: 110; }
    .modal {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 620px;
      max-height: 85vh;
      max-height: min(85dvh, calc(100dvh - 40px));
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
      flex-shrink: 0;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
    }
    .modal-title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      min-width: 0;
      overflow: hidden;
      -webkit-line-clamp: 3;
      font-size: 16px;
      font-weight: 700;
      color: var(--strong-text);
      overflow-wrap: anywhere;
    }
    .modal-close {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      padding: 4px;
      color: var(--text-muted);
      cursor: pointer;
      background: none;
      border: none;
      border-radius: 6px;
    }
    .modal-close:hover { color: var(--text); background: var(--surface-elevated); }
    .modal-body {
      min-height: 0;
      padding: 22px;
      overflow-y: auto;
      overscroll-behavior: contain;
      overflow-wrap: anywhere;
    }
    .modal-footer {
      display: flex;
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
      padding: 14px 22px;
      border-top: 1px solid var(--border);
    }

    /* Integration & Trackers styling */
    .integration-box {
      padding: 16px 0 0;
      margin-bottom: 14px;
      border-top: 1px solid var(--border);
    }
    .integration-label {
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .copy-input-row {
      display: flex;
      gap: 8px;
    }
    .copy-input {
      flex: 1;
    }
    .copy-input[readonly] { font-family: monospace; }
    .plugin-modal { max-width: 960px; }
    .plugin-workspace {
      display: grid;
      grid-template-columns: minmax(240px, 0.7fr) minmax(0, 1.3fr);
      gap: 28px;
    }
    .plugin-sidebar {
      min-width: 0;
      padding-right: 24px;
      border-right: 1px solid var(--border);
    }
    .plugin-section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }
    .plugin-section-header {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .plugin-form {
      display: grid;
      gap: 20px;
      align-content: start;
      min-width: 0;
    }
    .plugin-form h3 { font-size: 16px; }
    .plugin-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      min-width: 0;
    }
    .plugin-field[hidden], .plugin-form-actions [hidden] { display: none; }
    #plugin-instance-url { font-family: 'JetBrains Mono', monospace; }
    .plugin-toggles, .plugin-instance-list {
      display: grid;
      gap: 12px;
      margin: 16px 0 24px;
    }
    .plugin-toggle, .plugin-instance-row, .plugin-form-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .plugin-toggle { font-size: 12px; }
    .plugin-toggle input { accent-color: var(--accent); }
    .plugin-instance-row {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .plugin-instance-info {
      display: grid;
      flex: 1 1 100%;
      gap: 5px;
      min-width: 0;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .plugin-instance-info small {
      font-size: 11px;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .plugin-remove { color: var(--danger); }
    .plugin-help {
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-muted);
    }
    .plugin-help summary { cursor: pointer; }
    .plugin-help p { margin-top: 10px; overflow-wrap: anywhere; }
    .plugin-status {
      min-height: 20px;
      font-size: 12px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .plugin-status:empty { display: none; }
    .plugin-status[data-state='loading'] { color: var(--text-muted); }
    .plugin-status[data-state='success'] { color: var(--accent); }
    .plugin-status[data-state='error'] { color: var(--danger); }
    .plugin-form-actions {
      justify-content: flex-end;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    @media (max-width: 768px) {
      .plugin-workspace { grid-template-columns: 1fr; gap: 24px; }
      .plugin-sidebar { padding: 0 0 20px; border-right: 0; border-bottom: 1px solid var(--border); }
    }
    @media (max-width: 480px) {
      .plugin-field-grid { grid-template-columns: 1fr; }
      .plugin-form-actions .nav-btn { flex: 1 1 auto; }
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
      background: var(--text-dim);
      border-radius: 50%;
    }
    .status-dot.online { background: var(--accent); }
    .status-dot.offline { background: var(--danger); }
    .status-dot.untested { background: var(--text-dim); }

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
      color: var(--text);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
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
      color: var(--text);
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
    .empty-state.error { border-color: var(--danger); }
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
      max-width: min(420px, calc(100% - 48px));
    }
    .toast {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--strong-text);
      overflow-wrap: anywhere;
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

    .workspace-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      width: 100%;
      max-width: var(--content-width);
      padding: 18px 28px 24px;
      margin: 0 auto;
      font-size: 11px;
      color: var(--text-muted);
    }

    @media (max-width: 1000px) {
      .torrent-card { grid-template-columns: minmax(0, 1fr); }
      .torrent-actions { max-width: none; }
    }

    @media (max-width: 768px) {
      :root {
        --section-gap: 16px;
      }
      .header-inner {
        padding: 12px 16px;
      }
      main {
        padding: 24px 16px;
      }
      .workspace-footer { padding: 18px 16px 24px; }
      .search-inputs {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .search-query-field { grid-column: 1 / -1; }
      .torrent-card {
        grid-template-columns: minmax(0, 1fr);
      }
      .torrent-actions {
        justify-content: flex-start;
      }
      .modal {
        max-height: calc(100vh - 24px);
        max-height: calc(100dvh - 24px);
      }
      .modal-body {
        padding: 16px;
      }
    }

    @media (max-width: 600px) {
      .header-inner { flex-direction: column; gap: 8px; align-items: stretch; }
      .header-right { width: 100%; }
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
      .sort-select { flex: 1; }
      .modal-overlay { padding: 12px; }
      .modal-header, .modal-footer { padding: 12px 16px; }
      .shortcut-row { flex-wrap: wrap; gap: 8px; }
      .toast-container {
        right: 16px;
        bottom: 16px;
        left: 16px;
        max-width: none;
      }
      .toast {
        justify-content: center;
        width: 100%;
      }
    }

    @media (max-width: 480px) {
      .search-shortcut-hint { display: none; }
      .search-bar-wrap input { padding-right: 12px; }
      .empty-state { padding: 48px 12px; }
      .workspace-footer span:last-child { display: none; }
    }
    @media (pointer: coarse) {
      .header-right .nav-btn { width: 44px; }
      .pill { min-height: 44px; }
    }`;
