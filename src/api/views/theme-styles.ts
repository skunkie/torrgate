// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const THEME_STYLES = String.raw`
:root {
  --accent: #10b981;
  --accent-bg-subtle: rgba(16, 185, 129, 0.15);
  --accent-border: rgba(16, 185, 129, 0.3);
  --accent-glow: rgba(16, 185, 129, 0.2);
  --accent-hover: #059669;
  --accent-text: #ffffff;
  --badge-category-text: #7dd3fc;
  --badge-tracker-text: #a5b4fc;
  --bg: #0f0f0f;
  --border: #2d2d2d;
  --border-hover: #3f3f46;
  --border-subtle: #222222;
  --button-bg: #ffffff;
  --button-hover: #e4e4e7;
  --button-shadow: rgba(255, 255, 255, 0.12);
  --button-text: #18181b;
  --card-radius: 8px;
  --card-shadow: rgba(0, 0, 0, 0.35);
  --content-width: 1240px;
  --danger: #e86b6b;
  --error-text: #fca5a5;
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --header-height: 60px;
  --leech-color: #38bdf8;
  --modal-overlay: rgba(0, 0, 0, 0.7);
  --modal-shadow: rgba(0, 0, 0, 0.6);
  --section-gap: 24px;
  --seed-color: #10b981;
  --shortcut-text: #818cf8;
  --size-text: #e4e4e7;
  --skeleton-edge: #18181b;
  --skeleton-middle: #27272a;
  --strong-text: #fafafa;
  --subtle-text: #a1a1aa;
  --surface: #141414;
  --surface-elevated: #1a1a1c;
  --text: #e7e7e7;
  --text-dim: #636363;
  --text-muted: #8e8e8e;
  --toast-shadow: rgba(0, 0, 0, 0.5);
  color-scheme: dark;
}
:root[data-theme='light'] {
  --accent: #047857;
  --accent-bg-subtle: rgba(4, 120, 87, 0.1);
  --accent-border: rgba(4, 120, 87, 0.3);
  --accent-glow: rgba(4, 120, 87, 0.18);
  --accent-hover: #065f46;
  --badge-category-text: #0369a1;
  --badge-tracker-text: #4338ca;
  --bg: #f4f4f5;
  --border: #d4d4d8;
  --border-hover: #a1a1aa;
  --border-subtle: #e4e4e7;
  --button-bg: #18181b;
  --button-hover: #27272a;
  --button-shadow: rgba(24, 24, 27, 0.2);
  --button-text: #ffffff;
  --card-shadow: rgba(24, 24, 27, 0.12);
  --danger: #b91c1c;
  --error-text: #b91c1c;
  --leech-color: #0369a1;
  --modal-overlay: rgba(24, 24, 27, 0.45);
  --modal-shadow: rgba(24, 24, 27, 0.2);
  --seed-color: #047857;
  --shortcut-text: #4f46e5;
  --size-text: #3f3f46;
  --skeleton-edge: #e4e4e7;
  --skeleton-middle: #d4d4d8;
  --strong-text: #18181b;
  --subtle-text: #52525b;
  --surface: #ffffff;
  --surface-elevated: #f4f4f5;
  --text: #18181b;
  --text-dim: #71717a;
  --text-muted: #52525b;
  --toast-shadow: rgba(24, 24, 27, 0.18);
  color-scheme: light;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    --accent: #047857;
    --accent-bg-subtle: rgba(4, 120, 87, 0.1);
    --accent-border: rgba(4, 120, 87, 0.3);
    --accent-glow: rgba(4, 120, 87, 0.18);
    --accent-hover: #065f46;
    --badge-category-text: #0369a1;
    --badge-tracker-text: #4338ca;
    --bg: #f4f4f5;
    --border: #d4d4d8;
    --border-hover: #a1a1aa;
    --border-subtle: #e4e4e7;
    --button-bg: #18181b;
    --button-hover: #27272a;
    --button-shadow: rgba(24, 24, 27, 0.2);
    --button-text: #ffffff;
    --card-shadow: rgba(24, 24, 27, 0.12);
    --danger: #b91c1c;
    --error-text: #b91c1c;
    --leech-color: #0369a1;
    --modal-overlay: rgba(24, 24, 27, 0.45);
    --modal-shadow: rgba(24, 24, 27, 0.2);
    --seed-color: #047857;
    --shortcut-text: #4f46e5;
    --size-text: #3f3f46;
    --skeleton-edge: #e4e4e7;
    --skeleton-middle: #d4d4d8;
    --strong-text: #18181b;
    --subtle-text: #52525b;
    --surface: #ffffff;
    --surface-elevated: #f4f4f5;
    --text: #18181b;
    --text-dim: #71717a;
    --text-muted: #52525b;
    --toast-shadow: rgba(24, 24, 27, 0.18);
    color-scheme: light;
  }
}
`;
