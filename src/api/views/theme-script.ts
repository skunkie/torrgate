// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const THEME_SCRIPT = String.raw`
(function() {
  const STORAGE_KEY = 'torrgate_theme';
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getStoredTheme() {
    try {
      const theme = window.localStorage.getItem(STORAGE_KEY);
      return theme === 'dark' || theme === 'light' ? theme : null;
    } catch {
      return null;
    }
  }

  function getEffectiveTheme() {
    return document.documentElement.dataset.theme || (darkModeQuery.matches ? 'dark' : 'light');
  }

  function updateThemeColor() {
    const themeColor = document.getElementById('theme-color');
    if (themeColor) {
      themeColor.setAttribute('content', getEffectiveTheme() === 'dark' ? '#0f0f0f' : '#f4f4f5');
    }
  }

  function setStoredTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies for the current page when storage is unavailable.
    }
  }

  function updateToggle() {
    const button = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-toggle-icon');
    const label = document.getElementById('theme-toggle-label');
    if (!button || !icon || !label) return;

    const nextTheme = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    const nextThemeLabel = nextTheme === 'dark' ? 'Dark' : 'Light';
    button.setAttribute('aria-label', 'Use ' + nextThemeLabel.toLowerCase() + ' theme');
    button.setAttribute('title', 'Use ' + nextThemeLabel.toLowerCase() + ' theme');
    icon.textContent = nextTheme === 'dark' ? '☾' : '☀';
    label.textContent = nextThemeLabel;
  }

  const storedTheme = getStoredTheme();
  if (storedTheme) {
    document.documentElement.dataset.theme = storedTheme;
  }
  updateThemeColor();

  document.addEventListener('DOMContentLoaded', function() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    updateToggle();
    button.addEventListener('click', function() {
      const nextTheme = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
      setStoredTheme(nextTheme);
      updateThemeColor();
      updateToggle();
    });

    const handleSystemThemeChange = function() {
      if (!getStoredTheme()) {
        updateThemeColor();
        updateToggle();
      }
    };
    if (typeof darkModeQuery.addEventListener === 'function') {
      darkModeQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      darkModeQuery.addListener(handleSystemThemeChange);
    }
  });
})();
`;
