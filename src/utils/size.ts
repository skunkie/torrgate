// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

const UNIT_MULTIPLIERS: Record<string, number> = {
  B: 1,
  BYTES: 1,
  GB: 1024 * 1024 * 1024,
  GIB: 1024 * 1024 * 1024,
  KB: 1024,
  KIB: 1024,
  MB: 1024 * 1024,
  MIB: 1024 * 1024,
  PB: 1024 * 1024 * 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
  TIB: 1024 * 1024 * 1024 * 1024,
  БАЙТ: 1,
  ГБ: 1024 * 1024 * 1024,
  КБ: 1024,
  МБ: 1024 * 1024,
  ТБ: 1024 * 1024 * 1024 * 1024,
};

/**
 * Normalizes a number written with any common grouping or decimal convention to a plain
 * decimal string: `1 234,5` → `1234.5`, `1,234.5` → `1234.5`, `1.234.567` → `1234567`.
 * When both `,` and `.` appear, the last one is the decimal point; a single separator
 * repeated more than once is grouping; a single occurrence is a decimal point.
 */
export function normalizeDecimalNumber(raw: string): string {
  const compact = raw.replace(/[\s\u00A0\u202F']/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalIdx = Math.max(lastComma, lastDot);
    return `${compact.slice(0, decimalIdx).replace(/[.,]/g, '')}.${compact.slice(decimalIdx + 1)}`;
  }

  const separator = lastComma !== -1 ? ',' : lastDot !== -1 ? '.' : '';
  if (!separator) {
    return compact;
  }
  const occurrences = compact.split(separator).length - 1;
  return occurrences > 1 ? compact.replaceAll(separator, '') : compact.replace(separator, '.');
}

/**
 * Resiliently converts a human-readable size string into bytes.
 */
export function parseSizeBytes(sizeString: string): number {
  if (!sizeString || typeof sizeString !== 'string') {
    return 0;
  }

  const match = sizeString.trim().match(/^([\d\s\u00A0\u202F',.]*\d)\s*([A-Za-zА-Яа-яЁё]+)?/);
  if (!match) {
    return 0;
  }

  const value = parseFloat(normalizeDecimalNumber(match[1]));
  if (isNaN(value)) {
    return 0;
  }

  const unit = (match[2] || 'B').toUpperCase();
  const multiplier = UNIT_MULTIPLIERS[unit] || 1;

  return Math.round(value * multiplier);
}
