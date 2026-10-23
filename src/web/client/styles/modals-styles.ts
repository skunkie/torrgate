// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const MODALS_STYLES = String.raw`    /* Modal System */
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

`;
