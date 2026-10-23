// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const CONTROLS_STYLES = String.raw`    /* Switch toggle */
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
    .details-metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .details-poster {
      flex-shrink: 0;
      width: 112px;
      max-width: 100%;
      height: 168px;
      object-fit: contain;
      border-radius: 6px;
    }
    .details-description {
      flex: 1 1 220px;
      min-width: 0;
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-muted);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
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
      justify-content: flex-end;
      width: 100%;
      max-width: var(--content-width);
      padding: 18px 28px 24px;
      margin: 0 auto;
      font-size: 11px;
      color: var(--text-muted);
    }

`;
