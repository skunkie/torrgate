// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const testRuTrackerOrgSearchHtml = `
<html><body>
<a id="logged-in-username">Sample User</a>
<table id="tor-tbl"><tbody>
  <tr>
    <td></td><td></td>
    <td class="f-name-col"><div class="f-name"><a href="tracker.php?f=22">Наше кино</a></div></td>
    <td class="t-title-col"><div class="t-title"><a class="tLink" href="viewtopic.php?t=110001">Пример Фильма / Example Movie [2026, BDRip 1080p]</a></div></td>
    <td class="u-name-col">Sample Uploader</td>
    <td class="tor-size" data-ts_text="2684354560"><a class="tr-dl" href="dl.php?t=110001">2.5 GB</a></td>
    <td><b>1,234</b></td><td>15</td><td>2,345</td><td data-ts_text="1723723200">15 Авг 24</td>
  </tr>
  <tr>
    <td></td><td></td>
    <td class="f-name-col"><div class="f-name"><a href="tracker.php?f=9">Русские сериалы</a></div></td>
    <td class="t-title-col"><div class="t-title"><a class="tLink" href="viewtopic.php?t=110002">Тестовый Сериал / Sample Series Сезон: 1 Серии: 2 [2026, WEB-DLRip]</a></div></td>
    <td class="u-name-col">Sample Uploader</td>
    <td class="tor-size" data-ts_text="5368709120"><a class="tr-dl" href="dl.php?t=110002">5 GB</a></td>
    <td><b>81</b></td><td>3</td><td>150</td><td data-ts_text="1723809600">16 Авг 24</td>
  </tr>
  <tr>
    <td></td><td></td>
    <td class="f-name-col"><div class="f-name"><a href="tracker.php?f=9">Русские сериалы</a></div></td>
    <td class="t-title-col"><div class="t-title"><a class="tLink" href="viewtopic.php?t=110003">Тестовый Сериал / Sample Series Pending</a></div></td>
    <td class="u-name-col">Sample Uploader</td>
    <td class="tor-size" data-ts_text="0">Awaiting moderation</td>
    <td></td><td></td><td></td><td data-ts_text="1723809600"></td>
  </tr>
  <tr>
    <td></td><td></td>
    <td class="f-name-col"><div class="f-name"><a href="tracker.php?f=9">Русские сериалы</a></div></td>
    <td class="t-title-col"><div class="t-title"><a class="tLink" href="viewtopic.php?t=110004">Тестовый Сериал / Sample Series Older Episode</a></div></td>
    <td class="u-name-col">Sample Uploader</td>
    <td class="tor-size" data-ts_text="1048576"><a class="tr-dl" href="dl.php?t=110004">1 MB</a></td>
    <td><b>3 дн</b></td><td>0</td><td>1</td><td data-ts_text="1723636800">14 Авг 24</td>
  </tr>
</tbody></table>
</body></html>`;

export const testRuTrackerOrgTopicHtml = `
<html><body>
<a id="logged-in-username">Sample User</a>
<h1>Пример Фильма / Example Movie</h1>
<div class="post_body">Invented sample topic description.</div>
<table class="attach"><tr><td>
  <a class="tr-dl" href="dl.php?t=110001">Download</a>
  <a class="magnet-link" href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567">Magnet</a>
</td></tr></table>
</body></html>`;

export const testRuTrackerOrgTorrent = Buffer.from('d4:infod4:name15:Example Release6:pieces20:aaaaaaaaaaaaaaaaaaaaee');
