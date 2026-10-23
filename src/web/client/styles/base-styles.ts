// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const BASE_STYLES = String.raw`
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

`;
