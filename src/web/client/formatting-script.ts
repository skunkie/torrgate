// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const FORMATTING_SCRIPT = String.raw`
function createFormatting() {
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const bytesPerUnit = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    const unitIndex = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(bytesPerUnit))));
    return parseFloat((bytes / Math.pow(bytesPerUnit, unitIndex)).toFixed(2)) + ' ' + units[unitIndex];
  }

  function getLeechers(item) {
    return Math.max(0, Number(item.Peers) || 0);
  }

  function escapeHtml(value) {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  return { escapeHtml, formatBytes, getLeechers, isSafeUrl };
}
`;
