// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const LOGIN_PAGE_STYLES = String.raw`
* { box-sizing: border-box; }
body {
  -webkit-font-smoothing: antialiased;
  align-items: center;
  background: var(--bg);
  color: var(--text);
  display: flex;
  font: 14px/1.55 var(--font-sans);
  justify-content: center;
  margin: 0;
  min-height: 100dvh;
  padding: 24px 16px;
}
.wrap {
  margin: auto;
  max-width: 380px;
  text-align: center;
  width: 100%;
}
.brand {
  align-items: center;
  display: flex;
  font-size: 18px;
  font-weight: 700;
  gap: 10px;
  justify-content: center;
  line-height: 1.2;
  margin: 0 0 20px;
}
.brand-logo {
  color: var(--accent);
  flex: none;
  height: 24px;
  width: 24px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  box-shadow: 0 8px 24px var(--card-shadow);
  margin-bottom: 16px;
  padding: 20px;
  text-align: left;
}
.note {
  border: 1px solid currentColor;
  border-radius: var(--card-radius);
  font-size: 13px;
  margin-bottom: 16px;
  padding: 10px 13px;
}
.note.bad {
  color: var(--danger);
}
.field {
  margin-bottom: 15px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 5px;
}
input[type=password] {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  height: 44px;
  padding: 0 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
}
input[type=password]:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
  outline: none;
}
button {
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}
button[type=submit] {
  background: var(--button-bg);
  border: 1px solid transparent;
  border-radius: 10px;
  box-shadow: 0 4px 12px var(--button-shadow);
  color: var(--button-text);
  height: 44px;
  padding: 0 24px;
  width: 100%;
}
button[type=submit]:hover {
  background: var(--button-hover);
}
button:focus-visible {
  box-shadow: 0 0 0 3px var(--accent-glow);
  outline: none;
}
.theme-toggle {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  display: inline-flex;
  gap: 6px;
  padding: 6px 12px;
  position: fixed;
  right: 16px;
  top: 16px;
  transition: all 0.15s ease;
  width: auto;
}
.theme-toggle:hover {
  background: var(--surface-elevated);
  border-color: var(--border-hover);
  color: var(--text);
}
@media (max-width: 480px) {
  input[type=password] {
    font-size: 16px;
  }
}
`;
