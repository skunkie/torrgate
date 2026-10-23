// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const RESPONSIVE_STYLES = String.raw`    @media (max-width: 1000px) {
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
