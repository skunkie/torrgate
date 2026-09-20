// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  isValidTimeZone,
  normalizeDate,
  parseToIsoString,
  parseToUtcString,
} from '../../src/utils/date.js';

describe('Date Utilities', () => {
  describe('normalizeDate', () => {
    it('should normalize Russian month abbreviations with hyphens and spaces', () => {
      assert.equal(normalizeDate('15-Авг-24'), '2024-08-15');
      assert.equal(normalizeDate('15 Авг 2024'), '2024-08-15');
    });

    it('should normalize nominative and genitive Russian month names', () => {
      assert.equal(normalizeDate('15 мая 2024'), '2024-05-15');
      assert.equal(normalizeDate('15-Май-24'), '2024-05-15');
      assert.equal(normalizeDate('3 июня 2024, 18:05'), '2024-06-03 18:05');
      assert.equal(normalizeDate('1 сентября 2024'), '2024-09-01');
    });

    it('should normalize relative dates such as сегодня, вчера, сейчас, today, yesterday, now', () => {
      const today = new Date();
      const expectedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      assert.equal(normalizeDate('сегодня в 14:00'), `${expectedToday} 14:00`);
      assert.equal(normalizeDate('Today 12:30'), `${expectedToday} 12:30`);
      assert.equal(normalizeDate('сегодня'), expectedToday);
      assert.ok(normalizeDate('сейчас').startsWith(`${expectedToday} `));
      assert.ok(normalizeDate('now').startsWith(`${expectedToday} `));

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expectedYesterday = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      assert.equal(normalizeDate('вчера в 10:00'), `${expectedYesterday} 10:00`);
      assert.equal(normalizeDate('Yesterday 18:45'), `${expectedYesterday} 18:45`);
    });

    it('should normalize dotted dates with time suffixes', () => {
      assert.equal(normalizeDate('15.08.2024 в 10:00'), '2024-08-15 10:00');
      assert.equal(normalizeDate('15.08.2024'), '2024-08-15');
    });

    it('should normalize 10-digit unix timestamp strings', () => {
      const sampleTimestampString = '1723723200';
      const result = normalizeDate(sampleTimestampString);
      assert.equal(result, '2024-08-15T12:00:00.000Z');
    });

    it('should safely return empty string for empty inputs', () => {
      assert.equal(normalizeDate(''), '');
      assert.equal(normalizeDate('   '), '');
    });
  });

  describe('parseToIsoString & parseToUtcString', () => {
    it('should parse ISO date string to ISO timestamp', () => {
      const iso = parseToIsoString('2024-08-15');
      assert.equal(iso.startsWith('2024-08-15'), true);
    });

    it('should parse DD.MM.YYYY string to ISO timestamp', () => {
      const iso = parseToIsoString('15.08.2024');
      assert.equal(iso.startsWith('2024-08-15'), true);
    });

    it('should parse date string to RFC 822 UTC string for RSS', () => {
      const utc = parseToUtcString('2024-08-15');
      assert.match(utc, /Aug 2024/);
    });
  });
});

describe('normalizeDate with a tracker time zone', () => {
  it('should read times in the tracker zone and return UTC instants', () => {
    assert.equal(normalizeDate('15.08.2024 в 12:30', 'Europe/Moscow'), '2024-08-15T09:30:00.000Z');
    assert.equal(normalizeDate('3 июня 2024, 18:05', 'Europe/Moscow'), '2024-06-03T15:05:00.000Z');
    assert.equal(normalizeDate('2024-08-15 12:30', 'Europe/Moscow'), '2024-08-15T09:30:00.000Z');
  });

  it('should keep dates without a time as calendar dates', () => {
    assert.equal(normalizeDate('15 мая 2024', 'Europe/Moscow'), '2024-05-15');
  });

  it('should apply daylight saving offsets for zones that observe them', () => {
    assert.equal(normalizeDate('2024-03-10 03:30', 'America/New_York'), '2024-03-10T07:30:00.000Z');
    assert.equal(normalizeDate('2024-01-10 03:30', 'America/New_York'), '2024-01-10T08:30:00.000Z');
  });

  it('should resolve today and yesterday in the tracker zone near midnight', () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-22T22:30:00Z') });
    try {
      assert.equal(normalizeDate('сегодня в 01:00', 'Europe/Moscow'), '2026-09-22T22:00:00.000Z');
      assert.equal(normalizeDate('вчера в 23:50', 'Europe/Moscow'), '2026-09-22T20:50:00.000Z');
      assert.equal(normalizeDate('сегодня', 'Europe/Moscow'), '2026-09-23');
    } finally {
      mock.timers.reset();
    }
  });

  it('should validate time zone names', () => {
    assert.equal(isValidTimeZone('Europe/Moscow'), true);
    assert.equal(isValidTimeZone('Mars/Olympus_Mons'), false);
  });
});
