// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Synthetic torrent.by HTML search response containing invented test releases with direct magnet links.
 */
export const testTorrentBySearchHtml = `
<!DOCTYPE html>
<html>
<body>
<table>
  <tbody>
    <tr class="ttable_col1">
      <td>Сегодня 12:30</td>
      <td>Icon</td>
      <td>
        <a href="/torrent/800001">Тестовый Релиз / Test Release (2024) WEB-DL</a>
      </td>
      <td>
        <a class="dwnld" href="/download.php?id=800001">Download</a>
        <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=test">Magnet</a>
      </td>
      <td>1.85 GB</td>
      <td><font color="green">95</font></td>
      <td><font color="red">4</font></td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;
