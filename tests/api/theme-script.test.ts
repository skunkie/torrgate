// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { THEME_SCRIPT } from '../../src/api/views/theme-script.js';

type TestListener = () => void;

class TestElement {
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, TestListener>();
  textContent = '';

  addEventListener(type: string, listener: TestListener): void {
    this.listeners.set(type, listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function createThemeEnvironment(options: { isDark: boolean; storedTheme?: 'dark' | 'light' }) {
  const button = new TestElement();
  const documentElement = { dataset: {} as Record<string, string> };
  const icon = new TestElement();
  const label = new TestElement();
  const mediaQuery = {
    addEventListener: (_type: string, listener: TestListener) => {
      mediaQueryListener = listener;
    },
    matches: options.isDark,
  };
  const storage = new Map<string, string>();
  const themeColor = new TestElement();
  let domContentLoadedListener: TestListener | undefined;
  let mediaQueryListener: TestListener | undefined;

  if (options.storedTheme) {
    storage.set('torrgate_theme', options.storedTheme);
  }

  const elements = new Map<string, TestElement>([
    ['theme-color', themeColor],
    ['theme-toggle', button],
    ['theme-toggle-icon', icon],
    ['theme-toggle-label', label],
  ]);
  const document = {
    addEventListener: (_type: string, listener: TestListener) => {
      domContentLoadedListener = listener;
    },
    documentElement,
    getElementById: (id: string) => elements.get(id) ?? null,
  };
  const window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    matchMedia: () => mediaQuery,
  };

  runInNewContext(THEME_SCRIPT, { document, window });

  return {
    button,
    documentElement,
    icon,
    label,
    mediaQuery,
    runDomContentLoaded: () => domContentLoadedListener?.(),
    runMediaQueryChange: () => mediaQueryListener?.(),
    storage,
    themeColor,
  };
}

describe('Theme script', () => {
  it('applies the system theme and persists a manual selection', () => {
    const environment = createThemeEnvironment({ isDark: true });

    assert.equal(environment.themeColor.attributes.get('content'), '#0f0f0f');
    environment.runDomContentLoaded();
    assert.equal(environment.button.attributes.get('aria-label'), 'Use light theme');
    assert.equal(environment.icon.textContent, '☀');
    assert.equal(environment.label.textContent, 'Light');

    environment.button.listeners.get('click')?.();
    assert.equal(environment.documentElement.dataset.theme, 'light');
    assert.equal(environment.storage.get('torrgate_theme'), 'light');
    assert.equal(environment.themeColor.attributes.get('content'), '#f4f4f5');
    assert.equal(environment.button.attributes.get('aria-label'), 'Use dark theme');
    assert.equal(environment.icon.textContent, '☾');
    assert.equal(environment.label.textContent, 'Dark');
  });

  it('applies a stored preference before the document is ready', () => {
    const environment = createThemeEnvironment({ isDark: true, storedTheme: 'light' });

    assert.equal(environment.documentElement.dataset.theme, 'light');
    assert.equal(environment.themeColor.attributes.get('content'), '#f4f4f5');
    environment.runDomContentLoaded();
    assert.equal(environment.label.textContent, 'Dark');
  });

  it('tracks system theme changes until a preference is stored', () => {
    const environment = createThemeEnvironment({ isDark: true });
    environment.runDomContentLoaded();

    environment.mediaQuery.matches = false;
    environment.runMediaQueryChange();

    assert.equal(environment.themeColor.attributes.get('content'), '#f4f4f5');
    assert.equal(environment.icon.textContent, '☾');
    assert.equal(environment.label.textContent, 'Dark');
  });
});
