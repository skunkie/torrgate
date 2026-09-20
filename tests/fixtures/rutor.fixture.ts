// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Synthetic RuTor HTML search response containing invented test releases.
 */
export const testRuTorSearchHtml = `
<!DOCTYPE html>
<html>
<body>
<table id="news_table">
  <tbody>
    <tr>
      <td class="news_date">10 Авг 24</td>
      <td class="news_title">
        <a href="/torrent/100001/test-tracker-news">Тестовая Новость Трекера / Test Tracker News</a>
      </td>
    </tr>
  </tbody>
</table>
<div id="index">
<table>
  <tbody>
    <tr>
      <td>15 Авг 24</td>
      <td>
        <a class="downgif" href="//d.rutor.info/download/300001">Torrent</a>
        <a href="magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=test">Magnet</a>
        <a href="/torrent/300001/primer-reliza-example-release-2024-bdrip">Пример Релиза / Example Release (2024) BDRip</a>
      </td>
      <td>5</td>
      <td>2.18 GB</td>
      <td><span class="green">320</span></td>
      <td><span class="red">15</span></td>
    </tr>
  </tbody>
</table>
</div>
</body>
</html>
`;
