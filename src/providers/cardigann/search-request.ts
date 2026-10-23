// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { encodeWin1251QueryParam } from '../../http/http-client.js';
import { renderTemplate } from './template.js';
import { CardigannPath, CardigannSearch, TemplateContext } from './types.js';

/**
 * Renders a search path with the free-text request values percent-encoded, so keywords, the
 * search term, `ep`, and the music and book values cannot add path segments, query parameters,
 * or fragments. Configuration values such as `.Config.sitelink` stay literal.
 */
export function renderSearchPath(path: string, context: TemplateContext, baseUrl: string, encoding: 'utf-8' | 'windows-1251'): string {
  const encodePathValue = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    return encoding === 'windows-1251' ? encodeWin1251QueryParam(value, false) : encodeURIComponent(value);
  };
  const encodedKeywords = encodePathValue(context.Keywords ?? '');
  const pathContext: TemplateContext = {
    ...context,
    Config: { ...context.Config, sitelink: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/` },
    Keywords: encodedKeywords,
    Query: {
      ...context.Query,
      Album: encodePathValue(context.Query?.Album),
      Artist: encodePathValue(context.Query?.Artist),
      Author: encodePathValue(context.Query?.Author),
      Ep: encodePathValue(context.Query?.Ep),
      Episode: encodePathValue(context.Query?.Episode),
      Genre: encodePathValue(context.Query?.Genre),
      Keywords: encodePathValue(context.Query?.Keywords),
      Label: encodePathValue(context.Query?.Label),
      Q: encodePathValue(context.Query?.Q),
      Query: encodedKeywords,
      Title: encodePathValue(context.Query?.Title),
      Track: encodePathValue(context.Query?.Track),
    },
  };

  return renderTemplate(path, pathContext);
}

export function buildSearchInputs(search: CardigannSearch, pathDef: CardigannPath, context: TemplateContext): URLSearchParams {
  const queryParams = new URLSearchParams();

  const allInputs = {
    ...(search.inputs || {}),
    ...(pathDef.inputs || {}),
  };

  for (const [key, tmpl] of Object.entries(allInputs)) {
    if (key === '$raw') {
      const rawInputs = renderTemplate(String(tmpl), context, encodeURIComponent);
      for (const [name, value] of new URLSearchParams(rawInputs)) {
        if (name) queryParams.append(name, value);
      }
    } else {
      const value = renderTemplate(String(tmpl), context);
      if (value.trim() !== '' || search.allowemptyinputs) queryParams.set(key, value);
    }
  }

  return queryParams;
}

export function buildSearchUrl(path: string, context: TemplateContext, baseUrl: string, encoding: 'utf-8' | 'windows-1251', queryParams: URLSearchParams, isPost: boolean): string {
  const url = new URL(renderSearchPath(path, context, baseUrl, encoding), baseUrl);
  if (isPost) {
    return url.toString();
  }
  if (encoding === 'windows-1251') {
    const pairs = url.search
      .slice(1)
      .split('&')
      .filter(pair => {
        const key = decodeURIComponent(pair.split('=')[0].replaceAll('+', ' '));
        return pair !== '' && !queryParams.has(key);
      });
    for (const [k, v] of queryParams) {
      pairs.push(`${encodeWin1251QueryParam(k)}=${encodeWin1251QueryParam(v)}`);
    }
    const queryString = pairs.join('&');
    return `${url.origin}${url.pathname}${queryString ? `?${queryString}` : ''}`;
  }

  for (const key of new Set(queryParams.keys())) {
    url.searchParams.delete(key);
  }
  for (const [k, v] of queryParams) {
    url.searchParams.append(k, v);
  }
  return url.toString();
}
