// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CheerioAPI } from 'cheerio';

import { TopicDetails } from '../../types/torrent.js';
import { extractInfoHash } from '../../utils/magnet.js';
import { resolveSafeUrl } from '../../utils/url.js';

export function parseTopicDetails($: CheerioAPI, id: string, workingUrl: string, trackers?: string[]): TopicDetails | null {
  const name =
    $('h1').text().trim() ||
    $('a#topic-title').text().trim() ||
    $('a.maintitle').text().trim() ||
    $('.sub_title').text().trim() ||
    $('title').text().trim();

  if (!name) {
    return null;
  }

  const magnetHref = $('a[href^="magnet:"]').attr('href') || '';
  const infoHash = extractInfoHash(magnetHref) || '';
  let magnetUri = magnetHref;
  if (
    magnetUri &&
    trackers &&
    trackers.length > 0 &&
    !magnetUri.includes('&tr=')
  ) {
    for (const tracker of trackers) {
      magnetUri += `&tr=${encodeURIComponent(tracker)}`;
    }
  }

  const imdbUrl = $('a[href*="imdb.com"]').first().attr('href') || '';
  const kinopoiskUrl = $('a[href*="kinopoisk.ru"]').first().attr('href') || '';

  const posterUrl =
    $('table#details img, .postImg, .p200 img, .postbody img, img.poster').attr('src') ||
    $('var.postImg').attr('title') ||
    $('img').first().attr('src') ||
    '';

  const description =
    $('#details, .post_body, .postbody, .content').text().trim() || '';

  const downloadHref =
    $('a[href^="download.php"], a[href*="dl.php"], a[href^="https://d."]').attr('href') || '';
  const torrentUrl = downloadHref
    ? (resolveSafeUrl(downloadHref, workingUrl) ?? workingUrl)
    : workingUrl;

  return {
    actors: [],
    audioTranslation: '',
    category: '',
    description,
    director: '',
    duration: '',
    id,
    imdbId: imdbUrl.replace(/[^0-9]/g, '') || undefined,
    imdbUrl,
    infoHash,
    kinopoiskId: kinopoiskUrl.replace(/[^0-9]/g, '') || undefined,
    kinopoiskUrl,
    magnetUri,
    name,
    posterUrl,
    releaseCountry: '',
    torrentUrl,
    url: workingUrl,
    year: '',
  };
}
