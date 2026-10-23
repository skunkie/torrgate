// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

describe('CardigannProvider time zones', () => {
  const zoneDefinition: CardigannDefinition = {
    id: 'zonetracker',
    links: ['https://tracker.example.org/'],
    name: 'Zone Tracker',
    search: {
      fields: {
        date: { selector: 'td.date' },
        title: { selector: 'td.title' },
      },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  const zoneHtml = '<table><tr class="row"><td class="title">Example Release 2026</td><td class="date">15.08.2024 12:30</td></tr></table>';

  it('should read row times in Moscow time by default', async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => zoneHtml;
    const provider = new CardigannProvider(zoneDefinition, httpClient);

    assert.equal(provider.timeZone, 'Europe/Moscow');
    const [item] = await provider.searchByTitle({ query: 'example' });
    assert.equal(item.date, '2024-08-15T09:30:00.000Z');
  });

  it('should use the global prefixed time zone with per-tracker overrides', () => {
    const originalEnv = { ...process.env };
    process.env.TORRGATE_TRACKER_TIMEZONE = 'Asia/Tokyo';
    try {
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Asia/Tokyo');
      process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Europe/London';
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Europe/London');
    } finally {
      process.env = originalEnv;
    }
  });

  it('should honor a per-tracker time zone and ignore invalid names', () => {
    process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Asia/Tokyo';
    try {
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Asia/Tokyo');
      process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Not/A_Zone';
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Europe/Moscow');
    } finally {
      delete process.env.TORRGATE_ZONETRACKER_TIMEZONE;
    }
  });
});
