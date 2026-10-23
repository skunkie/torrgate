// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { normalizeDate } from '../../utils/date.js';
import { compileGoRegExp } from './regex.js';
import { renderTemplate } from './template.js';
import { CardigannFilter, TemplateContext } from './types.js';

/**
 * Settings that affect how filters interpret values.
 */
export interface FilterOptions {
  /** IANA time zone in which the tracker displays times, used by the date filters. */
  timeZone?: string;
}

/**
 * Decodes a URI component, returning the input unchanged when it holds a malformed escape.
 */
function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Applies a pipeline of Cardigann filter operations to an extracted value.
 */
export function applyFilters(
  initialValue: string,
  filters: CardigannFilter[] | undefined,
  context: TemplateContext,
  options: FilterOptions = {}
): string {
  if (!filters || filters.length === 0) {
    return initialValue;
  }

  let value = initialValue;

  for (const filter of filters) {
    const { args, name } = filter;

    switch (name) {
      case 'append': {
        const text = typeof args === 'string' ? renderTemplate(args, context) : String(args ?? '');
        value = `${value}${text}`;
        break;
      }

      case 'dateparse': {
        const normalized = normalizeDate(value, options.timeZone);
        // Some definitions strip the relative-day label, leaving a time without a date.
        value = Number.isNaN(Date.parse(normalized)) && /сегодня|вчера|today|yesterday/i.test(initialValue)
          ? normalizeDate(initialValue, options.timeZone)
          : normalized;
        break;
      }

      case 'default': {
        if (!value || value.trim() === '') {
          value = typeof args === 'string' ? renderTemplate(args, context) : String(args ?? '');
        }
        break;
      }

      case 'diacritics': {
        if (args === 'replace') {
          value = value.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
        }
        break;
      }

      case 'fuzzytime': {
        value = normalizeDate(value, options.timeZone);
        break;
      }

      case 'prepend': {
        const text = typeof args === 'string' ? renderTemplate(args, context) : String(args ?? '');
        value = `${text}${value}`;
        break;
      }

      case 'querystring': {
        const paramName = String(args ?? '');
        try {
          const url = new URL(value, 'https://example.org');
          value = url.searchParams.get(paramName) || '';
        } catch {
          const escapedName = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = value.match(new RegExp(`[?&]${escapedName}=([^&#]+)`));
          value = match ? safeDecodeUriComponent(match[1]) : '';
        }
        break;
      }

      case 're_replace': {
        if (Array.isArray(args) && args.length >= 2) {
          let replacement = String(args[1]);
          if (replacement.includes('{{')) {
            replacement = renderTemplate(replacement, context);
          }
          const regex = compileGoRegExp(String(args[0]), 'g');
          if (regex) {
            value = value.replace(regex, replacement);
          }
        }
        break;
      }

      case 'regexp': {
        if (typeof args === 'string') {
          value = compileGoRegExp(args)?.exec(value)?.[1] ?? '';
        }
        break;
      }

      case 'replace': {
        if (Array.isArray(args) && args.length >= 2) {
          const search = String(args[0]);
          const replacement = String(args[1]);
          value = value.replaceAll(search, replacement);
        }
        break;
      }

      case 'split': {
        if (Array.isArray(args) && args.length >= 2) {
          const delimiter = String(args[0]);
          const index = parseInt(String(args[1]), 10);
          const parts = value.split(delimiter);
          value = parts.at(index)?.trim() || '';
        }
        break;
      }

      case 'timeparse': {
        value = normalizeDate(value, options.timeZone);
        break;
      }

      case 'tolower': {
        value = value.toLowerCase();
        break;
      }

      case 'toupper': {
        value = value.toUpperCase();
        break;
      }

      case 'trim': {
        value = value.trim();
        break;
      }

      case 'urldecode': {
        value = safeDecodeUriComponent(value);
        break;
      }

      case 'urlencode': {
        value = encodeURIComponent(value);
        break;
      }

      default:
        break;
    }
  }

  return value;
}
