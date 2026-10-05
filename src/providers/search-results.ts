// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';

import { CheerioAPI } from 'cheerio';

import { SearchOptions, SearchPage } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';
import { expandTorznabCategories, matchesRequestedCategories } from '../utils/category-mapping.js';
import { normalizeDate } from '../utils/date.js';
import { buildMagnetUri, extractInfoHash } from '../utils/magnet.js';
import { parsePeerCount } from '../utils/peers.js';
import { parseSizeBytes } from '../utils/size.js';
import { resolveSafeUrl } from '../utils/url.js';
import { applyFilters } from './filters.js';
import { getTorrentResultIdentity } from './result-identity.js';
import { renderTemplate } from './template.js';
import { CardigannDefinition, CardigannField, TemplateContext } from './types.js';

interface SearchResultContext {
  context: TemplateContext;
  definition: CardigannDefinition;
  options: SearchOptions;
  supportsPaging: boolean;
  timeZone: string;
  workingUrl: string;
}

export function parseSearchResults(
  $: CheerioAPI,
  { context, definition, options, supportsPaging, timeZone, workingUrl }: SearchResultContext
): SearchPage {
  const mappings = definition.caps?.categorymappings ?? [];
  const requestedCategories = options.categories ?? [];
  const results: TorrentItem[] = [];
  const filterOptions = { timeZone };
  const rowsSelector = definition.search.rows.selector;
  const after = definition.search.rows.after ?? 0;
  const rawRows = $(rowsSelector).slice(after);
  const rawRowCount = rawRows.length;

  rawRows
    .each((_, rowElement) => {
      const row = $(rowElement);
      const rowContext: TemplateContext = {
        ...context,
        Result: {},
      };

      const extractField = (fieldDef?: CardigannField): string => {
        if (!fieldDef) return '';
        if (fieldDef.text !== undefined) {
          const rawText = String(fieldDef.text);
          const rendered = rawText.includes('{{')
            ? renderTemplate(rawText, rowContext)
            : rawText;
          return applyFilters(rendered, fieldDef.filters, rowContext, filterOptions);
        }

        let raw = '';
        const target = fieldDef.selector ? row.find(fieldDef.selector) : row;

        if (fieldDef.attribute) {
          raw = target.attr(fieldDef.attribute) || '';
        } else {
          raw = target.text().trim();
        }

        return applyFilters(raw, fieldDef.filters, rowContext, filterOptions);
      };

      const fields = definition.search.fields;
      for (const [key, fieldDef] of Object.entries(fields)) {
        const val = extractField(fieldDef);
        if (rowContext.Result) {
          rowContext.Result[key] = val;
        }
      }

      const title = rowContext.Result?.title ?? extractField(fields.title);
      if (!title) return;

      const detailsRaw = rowContext.Result?.details ?? extractField(fields.details);
      const detailsUrl = resolveSafeUrl(detailsRaw, workingUrl) ?? '';

      const torrentRaw = rowContext.Result?.download ?? extractField(fields.download);
      const torrentUrl = resolveSafeUrl(torrentRaw, workingUrl) ?? '';
      let magnetUri = rowContext.Result?.magnet ?? extractField(fields.magnet);
      const rawInfoHash = rowContext.Result?.infohash ?? extractField(fields.infohash);
      const infoHash = extractInfoHash(magnetUri) || extractInfoHash(rawInfoHash);
      if (!magnetUri && infoHash) {
        magnetUri = buildMagnetUri(infoHash, definition.trackers);
      } else if (
        magnetUri &&
        definition.trackers &&
        definition.trackers.length > 0 &&
        !magnetUri.includes('&tr=')
      ) {
        for (const tracker of definition.trackers) {
          magnetUri += `&tr=${encodeURIComponent(tracker)}`;
        }
      }
      const rawSize = rowContext.Result?.size ?? extractField(fields.size);
      const rawSeeders = rowContext.Result?.seeders ?? extractField(fields.seeders);
      const rawLeechers = rowContext.Result?.leechers ?? extractField(fields.leechers);
      const rawDate = rowContext.Result?.date ?? extractField(fields.date);
      const rawCategory = rowContext.Result?.category ?? extractField(fields.category);
      const rawGrabs = rowContext.Result?.grabs ?? extractField(fields.grabs);

      let topicId =
        rowContext.Result?.id ||
        extractField(fields.id) ||
        rawInfoHash;
      if (!topicId && detailsUrl) {
        const idMatch = detailsUrl.match(/[?&]t=(\d+)|[?&]id=(\d+)|\/torrent\/(\d+)/);
        topicId = idMatch ? idMatch[1] || idMatch[2] || idMatch[3] : '';
      }

      results.push({
        category: rawCategory,
        date: normalizeDate(rawDate, timeZone),
        downloadCount: parsePeerCount(rawGrabs),
        id: topicId || String(results.length + 1),
        leechers: parsePeerCount(rawLeechers),
        magnetUri: magnetUri || undefined,
        name: title,
        seeders: parsePeerCount(rawSeeders),
        size: rawSize,
        sizeBytes: parseSizeBytes(rawSize),
        torrentUrl: torrentUrl || detailsUrl,
        url: detailsUrl,
      });
    });

  const pageIdentity = results.length > 0
    ? crypto
      .createHash('sha256')
      .update(JSON.stringify(results.map(getTorrentResultIdentity)))
      .digest('hex')
    : undefined;
  const expandedCategories = expandTorznabCategories(requestedCategories);
  const categoryItems = requestedCategories.length === 0
    ? results
    : results.filter(item =>
      matchesRequestedCategories(item.category, expandedCategories, mappings)
    );
  const requestedFormat = options.format;
  const items = requestedFormat === undefined
    ? categoryItems
    : categoryItems.filter(item => matchesVideoFormat(item.name, requestedFormat));
  return {
    hasMore: supportsPaging && rawRowCount > 0,
    items,
    pageIdentity,
  };
}

function matchesVideoFormat(title: string, format: number): boolean {
  const numericFormat = new RegExp(`(^|\\D)${format}(?:i|p)?(?=\\D|$)`, 'i');
  return numericFormat.test(title) || (format === 2160 && /(^|\W)4k(?=\W|$)/i.test(title));
}
