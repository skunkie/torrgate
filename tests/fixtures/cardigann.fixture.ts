// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CardigannDefinition } from '../../src/providers/cardigann/types.js';

export const testCardigannHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <table class="results">
          <tr class="item-row">
            <td class="date">15-Авг-24</td>
            <td class="title">
              <a href="/torrent/500001/sample-release-2024">Пример Релиза / Sample Release (2024) BDRip</a>
              <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"></a>
              <a href="https://d.example.org/download/500001"></a>
            </td>
            <td class="size">1.45 GB</td>
            <td class="seeds"><span class="green">150</span></td>
            <td class="leech"><span class="red">12</span></td>
          </tr>
        </table>
      </body>
    </html>
  `;

export const testCardigannDefinition: CardigannDefinition = {
  links: ['https://example.org'],
  name: 'Sample Tracker',
  search: {
    fields: {
      category: {
        text: 'Movies',
      },
      date: {
        filters: [
          {
            name: 'dateparse',
          },
        ],
        selector: 'td.date',
      },
      details: {
        attribute: 'href',
        selector: 'td.title a[href^="/torrent/"]',
      },
      download: {
        attribute: 'href',
        selector: 'td.title a[href^="https://d.example.org/"]',
      },
      id: {
        attribute: 'href',
        filters: [
          {
            args: ['/torrent/(\\d+).*', '$1'],
            name: 're_replace',
          },
        ],
        selector: 'td.title a[href^="/torrent/"]',
      },
      leechers: {
        selector: 'td.leech',
      },
      magnet: {
        attribute: 'href',
        selector: 'td.title a[href^="magnet:"]',
      },
      seeders: {
        selector: 'td.seeds',
      },
      size: {
        selector: 'td.size',
      },
      title: {
        selector: 'td.title a[href^="/torrent/"]',
      },
    },
    paths: [
      {
        inputs: {
          q: '{{ .Keywords }}',
        },
        path: '/search',
      },
    ],
    rows: {
      selector: 'table.results tr.item-row',
    },
  },
};
