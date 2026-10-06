// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const LOGIN_PAGE_STYLES = String.raw`
* { box-sizing: border-box; }
body {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  margin: 0;
  font: 13px/1.6 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  color: var(--text);
  background: var(--surface);
}
.login-header {
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
.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
}
.brand-logo {
  flex: none;
  width: 24px;
  height: 24px;
  color: var(--accent);
}
.theme-toggle { min-width: 36px; }
.theme-toggle span:not(#theme-toggle-icon) { display: none; }
.wrap {
  width: 100%;
  max-width: 416px;
  padding: 64px 28px;
  margin: auto;
}
h1 { margin: 0; font-size: 16px; font-weight: 600; }
.login-form { margin-top: 24px; }
.login-actions {
  padding-top: 18px;
  margin-top: 24px;
  border-top: 1px solid var(--border);
}
.login-actions .form-button { width: 100%; min-height: 40px; }
.note {
  padding: 10px 12px;
  margin-top: 20px;
  font-size: 13px;
  overflow-wrap: anywhere;
  border-left: 3px solid var(--danger);
}
.note.bad { color: var(--danger); }
@media (max-width: 768px) {
  .header-inner { padding: 12px 16px; }
  .wrap { padding: 40px 20px; }
}
`;
