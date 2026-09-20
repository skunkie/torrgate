// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Month numbers keyed by the first three lowercase letters of a Russian month name,
 * covering abbreviations (`Авг`), nominative (`Май`) and genitive (`мая`, `июня`) forms.
 */
const RUSSIAN_MONTH_PREFIXES: Record<string, string> = {
  авг: '08',
  апр: '04',
  дек: '12',
  июл: '07',
  июн: '06',
  май: '05',
  мар: '03',
  мая: '05',
  ноя: '11',
  окт: '10',
  сен: '09',
  фев: '02',
  янв: '01',
};

/**
 * Time zone assumed for tracker times that carry no zone of their own. The bundled
 * trackers display Moscow time (UTC+3).
 */
export const DEFAULT_TRACKER_TIME_ZONE = 'Europe/Moscow';

interface CalendarDate {
  day: number;
  month: number;
  year: number;
}

interface TimeOfDay {
  hours: number;
  minutes: number;
}

/**
 * Returns whether the runtime recognizes an IANA time zone name.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function getZonedWallClock(instant: Date, timeZone: string): CalendarDate & TimeOfDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    minute: 'numeric',
    month: 'numeric',
    timeZone,
    year: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find(part => part.type === type)?.value ?? 0);
  return {
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
    month: get('month'),
    year: get('year'),
  };
}

/**
 * Converts a wall-clock time in an IANA time zone to the absolute instant it denotes.
 */
export function zonedTimeToUtc(date: CalendarDate, time: TimeOfDay, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, time.hours, time.minutes);
  const offsetAt = (instantMs: number): number => {
    const wall = getZonedWallClock(new Date(instantMs), timeZone);
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hours, wall.minutes) - instantMs;
  };

  const firstOffset = offsetAt(wallClockAsUtc);
  const candidate = wallClockAsUtc - firstOffset;
  const secondOffset = offsetAt(candidate);
  return new Date(secondOffset === firstOffset ? candidate : wallClockAsUtc - secondOffset);
}

function currentDate(timeZone: string | undefined, dayOffset = 0): CalendarDate {
  const now = new Date();
  if (timeZone) {
    const wall = getZonedWallClock(now, timeZone);
    const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + dayOffset));
    return { day: shifted.getUTCDate(), month: shifted.getUTCMonth() + 1, year: shifted.getUTCFullYear() };
  }
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return { day: local.getDate(), month: local.getMonth() + 1, year: local.getFullYear() };
}

/**
 * Returns the first time of day (`HH:mm`) in the text, if any.
 */
function extractTime(text: string): TimeOfDay | undefined {
  const match = text.match(/(?:^|\D)(\d{1,2}):(\d{2})(?!\d)/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return undefined;
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function expandYear(year: string): number {
  return Number(year.length === 2 ? `20${year}` : year);
}

function formatResult(date: CalendarDate, time: TimeOfDay | undefined, timeZone: string | undefined): string {
  const ymd = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  if (!time) {
    return ymd;
  }
  if (timeZone) {
    return zonedTimeToUtc(date, time, timeZone).toISOString();
  }
  return `${ymd} ${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

/**
 * Resiliently normalizes tracker date formats. Supports relative dates (сегодня, вчера,
 * сейчас), `DD.MM.YYYY`, Russian month names in abbreviated, nominative and genitive forms,
 * `YYYY-MM-DD HH:mm` and Unix timestamps.
 *
 * A date without a time becomes `YYYY-MM-DD`. A date with a time of day is read in
 * `timeZone` (the tracker's zone) and returned as a UTC ISO string; without `timeZone` it
 * stays a zone-less `YYYY-MM-DD HH:mm`. Unrecognized input is returned trimmed so later
 * parsing can still try it.
 */
export function normalizeDate(dateStr: string, timeZone?: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return '';
  }

  const trimmed = dateStr.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{10}$/.test(trimmed)) {
    const date = new Date(parseInt(trimmed, 10) * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const lower = trimmed.toLowerCase();
  const time = extractTime(trimmed);

  if (lower.includes('сейчас') || lower === 'now') {
    const now = new Date();
    if (timeZone) {
      return now.toISOString();
    }
    return formatResult(currentDate(undefined), { hours: now.getHours(), minutes: now.getMinutes() }, undefined);
  }

  if (lower.includes('сегодня') || lower.includes('today')) {
    return formatResult(currentDate(timeZone), time, timeZone);
  }

  if (lower.includes('вчера') || lower.includes('yesterday')) {
    return formatResult(currentDate(timeZone, -1), time, timeZone);
  }

  const isoLocalMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/);
  if (isoLocalMatch) {
    const date = { day: Number(isoLocalMatch[3]), month: Number(isoLocalMatch[2]), year: Number(isoLocalMatch[1]) };
    const isoTime = isoLocalMatch[4] ? { hours: Number(isoLocalMatch[4]), minutes: Number(isoLocalMatch[5]) } : undefined;
    return formatResult(date, isoTime, timeZone);
  }

  const ddmmyyyyMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (ddmmyyyyMatch) {
    const date = { day: Number(ddmmyyyyMatch[1]), month: Number(ddmmyyyyMatch[2]), year: expandYear(ddmmyyyyMatch[3]) };
    return formatResult(date, time, timeZone);
  }

  const monthMatch = trimmed.match(/(\d{1,2})[-\s]+([А-Яа-яЁё]{3,})\.?[-\s,]+(\d{2,4})/);
  if (monthMatch) {
    const month = RUSSIAN_MONTH_PREFIXES[monthMatch[2].slice(0, 3).toLowerCase()];
    if (month) {
      const date = { day: Number(monthMatch[1]), month: Number(month), year: expandYear(monthMatch[3]) };
      return formatResult(date, time, timeZone);
    }
  }

  return trimmed;
}

/**
 * Parses any date string (ISO YYYY-MM-DD or DD.MM.YYYY) into an ISO 8601 string.
 * Falls back to current time if parsing fails.
 */
export function parseToIsoString(dateStr?: string): string {
  if (!dateStr) {
    return new Date().toISOString();
  }

  // If in DD.MM.YYYY format, convert to YYYY-MM-DD first
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  const normalized = ddmmyyyyMatch
    ? `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}${ddmmyyyyMatch[4]}`
    : dateStr;

  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

/**
 * Parses any date string into an RFC 822 UTC string for RSS feeds.
 * Falls back to current time if parsing fails.
 */
export function parseToUtcString(dateStr?: string): string {
  if (!dateStr) {
    return new Date().toUTCString();
  }

  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  const normalized = ddmmyyyyMatch
    ? `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}${ddmmyyyyMatch[4]}`
    : dateStr;

  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime()) ? parsed.toUTCString() : new Date().toUTCString();
}
