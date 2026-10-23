// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import crypto from 'node:crypto';

import { CheerioAPI } from 'cheerio';

import {
  expandTorznabCategories,
  matchesRequestedCategories,
  trackerCatToTorznabIds,
} from '../../jackett/categories/mapping.js';
import { hasImdbSearch, isSearchParameterSupported, TorznabSearchCaps } from '../../jackett/torznab/caps.js';
import { getTorrentResultIdentity } from '../../search/result-identity.js';
import { SearchOptions } from '../../types/provider.js';
import { TorrentItem } from '../../types/torrent.js';
import { normalizeDate } from '../../utils/date.js';
import { buildMagnetUri, extractInfoHash } from '../../utils/magnet.js';
import { parsePeerCount } from '../../utils/peers.js';
import { parseSizeBytes } from '../../utils/size.js';
import { resolveSafeUrl } from '../../utils/url.js';
import { getDefinitionCategoryMappings } from './categories.js';
import { applyFilters } from './filters.js';
import { renderTemplate } from './template.js';
import { CardigannDefinition, CardigannField, TemplateContext } from './types.js';

/**
 * Result fields Jackett always treats as optional, whatever their definition says.
 */
const JACKETT_OPTIONAL_FIELDS: ReadonlySet<string> = new Set([
  'description',
  'doubanid',
  'genre',
  'imdb',
  'imdbid',
  'poster',
  'rageid',
  'tmdbid',
  'traktid',
  'tvdbid',
  'tvmazeid',
]);

interface SearchResultContext {
  context: TemplateContext;
  definition: CardigannDefinition;
  options: SearchOptions;
  searchCaps: TorznabSearchCaps;
  timeZone: string;
  workingUrl: string;
}

export function parseSearchResults(
  $: CheerioAPI,
  { context, definition, options, searchCaps, timeZone, workingUrl }: SearchResultContext
): TorrentItem[] {
  const mappings = getDefinitionCategoryMappings(definition.caps);
  const requestedCategories = options.categories ?? [];
  const results: TorrentItem[] = [];
  const filterOptions = { timeZone };
  const rowsSelector = definition.search.rows.selector;
  const after = definition.search.rows.after ?? 0;
  const rawRows = $(rowsSelector).slice(after);

  rawRows
    .each((_, rowElement) => {
      const row = $(rowElement);
      const rowContext: TemplateContext = {
        ...context,
        Result: {},
      };

      const extractField = (fieldDef: CardigannField): string | undefined => {
        if (fieldDef.text !== undefined) {
          const rawText = String(fieldDef.text);
          const rendered = rawText.includes('{{')
            ? renderTemplate(rawText, rowContext)
            : rawText;
          return applyFilters(rendered, fieldDef.filters, rowContext, filterOptions);
        }

        const selector = fieldDef.selector ? renderTemplate(fieldDef.selector, rowContext) : undefined;
        const target = selector ? (row.is(selector) ? row : row.find(selector).first()) : row;
        if (target.length === 0) {
          return undefined;
        }

        if (fieldDef.remove) target.find(fieldDef.remove).remove();

        let raw: string | undefined;
        if (fieldDef.case) {
          const choice = Object.entries(fieldDef.case).find(([caseSelector]) => target.is(caseSelector) || target.find(caseSelector).length > 0);
          raw = choice === undefined ? undefined : renderTemplate(String(choice[1]), rowContext);
        } else if (fieldDef.attribute) {
          raw = target.attr(fieldDef.attribute);
        } else {
          raw = target.text();
        }
        return raw === undefined ? undefined : applyFilters(raw.trim(), fieldDef.filters, rowContext, filterOptions);
      };

      const fields = definition.search.fields;
      const result: Record<string, string> = {};
      const values: Record<string, string> = {};
      let categories: number[] = [];
      let genres: string[] | undefined;
      let totalPeers: number | undefined;
      let imdbField: string | undefined;
      rowContext.Result = result;
      for (const [key, fieldDef] of Object.entries(fields)) {
        const [name, ...modifiers] = key.split('|');
        const isOptional = fieldDef.optional === true || modifiers.includes('optional') || JACKETT_OPTIONAL_FIELDS.has(key);
        let value: string | undefined;
        try {
          value = extractField(fieldDef);
          if (value === undefined && !isOptional) return;
          if (isOptional && !value?.trim()) {
            const fallback = fieldDef.default === undefined ? '' : renderTemplate(String(fieldDef.default), rowContext);
            if (!fallback.trim()) {
              result[name] = '';
              continue;
            }
            value = fallback;
          }
          value ??= '';
          if ((name === 'title' || name === 'description') && modifiers.includes('append')) {
            value = (values[name] ?? '') + value;
          }
          if (name === 'category' || name === 'categorydesc') {
            const description = value.toLowerCase();
            const mapped = name === 'categorydesc'
              ? [...new Set(mappings
                .filter(mapping => description.trim() !== '' && mapping.desc?.toLowerCase() === description)
                .flatMap(mapping => trackerCatToTorznabIds(mapping.id, [mapping])))]
              : trackerCatToTorznabIds(value, mappings);
            if (mapped.length > 0) {
              categories = modifiers.includes('noappend') ? mapped : [...new Set([...categories, ...mapped])];
            }
          }
          if (name === 'genre') genres = parseGenres(value, genres);
          if (name === 'seeders' || name === 'leechers') {
            const peers = parsePeerCount(value);
            totalPeers = (totalPeers ?? 0) + peers;
            value = String(peers);
          }
          if (name === 'imdb' || name === 'imdbid') imdbField = name;
          values[name] = value;
          if ((name === 'category' || name === 'categorydesc') && (categories.length > 0 || !value.trim())) {
            // Jackett exposes List<int>.ToString() for mapped category result variables.
            result[name] = 'System.Collections.Generic.List`1[System.Int32]';
          } else {
            result[name] = name === 'genre' ? (genres ?? []).join(',') : value;
          }
        } catch {
          if (!isOptional) return;
          result[name] = '';
        }
      }

      const title = values.title ?? '';
      if (!title.trim()) return;

      const detailsRaw = values.details ?? '';
      const detailsUrl = resolveSafeUrl(detailsRaw, workingUrl) ?? '';

      const torrentRaw = values.download ?? '';
      const torrentUrl = resolveSafeUrl(torrentRaw, workingUrl) ?? '';
      let magnetUri = values.magnet ?? '';
      const rawInfoHash = values.infohash ?? '';
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
      const rawSize = values.size ?? '';
      const rawDate = values.date ?? '';
      const rawCategory = values.category ?? '';
      const posterUrl = resolveSafeUrl(values.poster, workingUrl);
      const readDeclaredField = (name: string): string | undefined => values[name];
      const readCount = (name: string): number | undefined => {
        const raw = readDeclaredField(name);
        return raw === undefined ? undefined : parsePeerCount(raw);
      };
      const readId = (name: string): number | undefined => {
        const raw = readDeclaredField(name);
        return raw === undefined ? undefined : parseLeadingId(raw);
      };
      const imdbNumber = imdbField === undefined ? undefined : readId(imdbField);
      const seeders = readCount('seeders');
      const leechers = totalPeers === undefined ? undefined : totalPeers - (seeders ?? 0);
      const extractNumber = (field: string): number | undefined => {
        const raw = values[field];
        if (raw === undefined || raw.trim() === '') return undefined;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 ? value : undefined;
      };

      let topicId = values.id ?? '';
      if (!topicId && detailsUrl) {
        const idMatch = detailsUrl.match(/[?&]t=(\d+)|[?&]id=(\d+)|\/torrent\/(\d+)/);
        topicId = idMatch ? idMatch[1] || idMatch[2] || idMatch[3] : '';
      }

      const item: TorrentItem = {
        album: readDeclaredField('album'),
        artist: readDeclaredField('artist'),
        author: readDeclaredField('author'),
        bookTitle: readDeclaredField('booktitle'),
        categories,
        category: rawCategory,
        date: normalizeDate(rawDate, timeZone),
        description: readDeclaredField('description'),
        doubanId: readId('doubanid'),
        downloadCount: readCount('grabs'),
        downloadVolumeFactor: extractNumber('downloadvolumefactor'),
        files: readCount('files'),
        genres,
        id: topicId || infoHash || '',
        imdbId: imdbNumber === undefined ? undefined : `tt${String(imdbNumber).padStart(7, '0')}`,
        infoHash: rawInfoHash || undefined,
        label: readDeclaredField('label'),
        leechers,
        magnetUri: magnetUri || undefined,
        minimumRatio: extractNumber('minimumratio'),
        minimumSeedTimeSeconds: extractNumber('minimumseedtime'),
        name: title,
        posterUrl: posterUrl && /^https?:/.test(posterUrl) ? posterUrl : undefined,
        publisher: readDeclaredField('publisher'),
        rageId: readId('rageid'),
        seeders,
        size: rawSize,
        sizeBytes: values.size === undefined ? undefined : parseSizeBytes(rawSize),
        tmdbId: readId('tmdbid'),
        torrentUrl,
        track: readDeclaredField('track'),
        traktId: readId('traktid'),
        tvdbId: readId('tvdbid'),
        tvmazeId: readId('tvmazeid'),
        uploadVolumeFactor: extractNumber('uploadvolumefactor'),
        url: detailsUrl,
        year: readCount('year'),
      };
      item.id ||= createFallbackId(item);
      results.push(item);
    });

  const expandedCategories = expandTorznabCategories(requestedCategories);
  const andMatchLimits = isMatchedById(searchCaps, options)
    ? []
    : (definition.search.rows.filters ?? []).filter(filter => filter.name === 'andmatch').map(filter => Number(filter.args));
  const andMatchKeywords = getAndMatchKeywords(context);
  const matchingItems = results.filter(item =>
    andMatchLimits.every(limit => matchesAllKeywords(item.name, andMatchKeywords, limit))
  );
  const categoryItems = requestedCategories.length === 0
    ? matchingItems
    : matchingItems.filter(item =>
      matchesRequestedCategories(item.categories ?? item.category, expandedCategories, mappings)
    );
  const validItems = !options.shouldDropIncompleteReleases
    ? categoryItems
    : categoryItems.filter(item => item.sizeBytes !== undefined && (item.categories ?? trackerCatToTorznabIds(item.category, mappings)).length > 0);
  const requestedFormat = options.format;
  const items = requestedFormat === undefined
    ? validItems
    : validItems.filter(item => matchesVideoFormat(item.name, requestedFormat));
  return items;
}

/**
 * Whether the tracker matched an id the indexer searches by rather than keywords, so `andmatch`
 * is skipped. Follows Jackett: IMDb, Douban, and Trakt ids need movie or TV IMDb search, TMDB ids
 * need movie or TV TMDB search, TVDB ids need TV TVDB search, and TVmaze and TVRage ids need TV
 * IMDb search.
 */
function isMatchedById(caps: TorznabSearchCaps, options: SearchOptions): boolean {
  return (
    (options.imdbId !== undefined && hasImdbSearch(caps)) ||
    (options.tmdbId !== undefined &&
      (isSearchParameterSupported(caps, 'movie-search', 'tmdbid') || isSearchParameterSupported(caps, 'tv-search', 'tmdbid'))) ||
    (options.tvdbId !== undefined && isSearchParameterSupported(caps, 'tv-search', 'tvdbid')) ||
    ((options.doubanId !== undefined || options.traktId !== undefined) && hasImdbSearch(caps)) ||
    ((options.tvmazeId !== undefined || options.rageId !== undefined) && caps.supportsTvImdbSearch)
  );
}

/**
 * Reads an external id as Jackett does: the first run of digits, or 0 when there is none.
 */
function parseLeadingId(raw: string): number {
  return Number(/\d+/.exec(raw)?.[0] ?? 0);
}

/**
 * Splits a genre field as Jackett does: on its delimiter characters, keeping each genre once in
 * order, then reading underscores as spaces.
 */
function parseGenres(raw: string, previous: string[] = []): string[] {
  const genres = [...new Set([...previous, ...raw.split(/[, /)(.;[\]"|:]/).filter(genre => genre !== '')])];
  return genres.map(genre => genre.replace(/_/g, ' '));
}

/**
 * Derives an id for a row with no topic id or infohash from its links or title, so the same
 * row keeps its id across repeated searches.
 */
function createFallbackId(item: TorrentItem): string {
  return crypto.createHash('sha256').update(getTorrentResultIdentity(item)).digest('hex').slice(0, 16);
}

/**
 * Returns the filtered keywords, or the search term and episode tag when filters leave them blank.
 */
function getAndMatchKeywords(context: TemplateContext): string {
  if (context.Keywords?.trim()) return context.Keywords;
  return `${context.Query?.Q ?? ''} ${context.Query?.Episode ?? ''}`.trim();
}

/**
 * Checks that the title contains every keyword word, splitting on .NET non-word characters
 * and ignoring single letters and common English words.
 */
function matchesAllKeywords(title: string, keywords: string, limit: number): boolean {
  const query = limit > 0 ? keywords.slice(0, limit) : keywords;
  const words = query.toLowerCase().split(/[^\p{L}\p{Mn}\p{Nd}\p{Pc}]+/u)
    .filter(word => word.length > 1 && !['and', 'the', 'an'].includes(word));
  const normalizedTitle = title.toLowerCase();
  return words.every(word => normalizedTitle.includes(word));
}

function matchesVideoFormat(title: string, format: number): boolean {
  const numericFormat = new RegExp(`(^|\\D)${format}(?:i|p)?(?=\\D|$)`, 'i');
  return numericFormat.test(title) || (format === 2160 && /(^|\W)4k(?=\W|$)/i.test(title));
}
