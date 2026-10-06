// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const FORM_STYLES = String.raw`
  .form-field, .plugin-field {
    display: grid;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    font-weight: 500;
  }
  .form-section, .plugin-section {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 16px 0 0;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .form-section legend, .plugin-section legend {
    padding-right: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .form-caption, .plugin-caption {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-muted);
  }
  .form-input, .copy-input {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 8px 12px;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    color: var(--text);
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color 0.15s ease;
  }
  .form-input::placeholder, .copy-input::placeholder { color: var(--text-muted); }
  .nav-btn, .form-button, .action-btn {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 7px 12px;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  }
  .nav-btn:hover, .form-button:hover, .action-btn:hover {
    color: var(--text);
    background: var(--surface-elevated);
    border-color: var(--border-hover);
  }
  .nav-btn.primary, .form-button.primary {
    font-weight: 600;
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }
  .nav-btn.primary:hover, .form-button.primary:hover {
    color: var(--accent-text);
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .nav-btn:disabled, .form-button:disabled, .action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  :where(a, button, input, select, summary):focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (max-width: 768px) {
    .form-input, .copy-input { font-size: 16px; }
  }
  @media (pointer: coarse) {
    .nav-btn, .form-button, .action-btn { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`;
