// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const RESULTS_STYLES = String.raw`    /* Results Bar */
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
      padding: 18px 12px;
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
      background: var(--accent-bg-subtle);
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

`;
