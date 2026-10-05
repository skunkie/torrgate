// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const LOGIN_PAGE_STYLES = String.raw`
* { box-sizing: border-box; }
body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px 16px;
  margin: 0;
  font: 14px/1.55 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  color: var(--text);
  background: var(--bg);
}
.wrap {
  width: 100%;
  max-width: 380px;
  margin: auto;
  text-align: center;
}
.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.brand-logo {
  flex: none;
  width: 24px;
  height: 24px;
  color: var(--accent);
}
.card {
  padding: 20px;
  margin-bottom: 16px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  box-shadow: 0 8px 24px var(--card-shadow);
}
.note {
  padding: 10px 13px;
  margin-bottom: 16px;
  font-size: 13px;
  border: 1px solid currentColor;
  border-radius: var(--card-radius);
}
.note.bad {
  color: var(--danger);
}
.field {
  margin-bottom: 15px;
}
label {
  display: block;
  margin-bottom: 5px;
  font-size: 13px;
  font-weight: 500;
}
input[type=password] {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  font: inherit;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input[type=password]:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
button {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}
button[type=submit] {
  width: 100%;
  height: 44px;
  padding: 0 24px;
  color: var(--button-text);
  background: var(--button-bg);
  border: 1px solid transparent;
  border-radius: 10px;
  box-shadow: 0 4px 12px var(--button-shadow);
}
button[type=submit]:hover {
  background: var(--button-hover);
}
button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  width: auto;
  padding: 6px 12px;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}
.theme-toggle:hover {
  color: var(--text);
  background: var(--surface-elevated);
  border-color: var(--border-hover);
}
@media (max-width: 480px) {
  input[type=password] {
    font-size: 16px;
  }
}
`;
