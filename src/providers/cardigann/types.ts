// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TrackerCategoryMapping } from '../../types/provider.js';

/**
 * Filter operation applied to an extracted field value.
 */
export interface CardigannFilter {
  args?: (number | string)[] | number | string;
  name: string;
}

/**
 * Field extraction specification in a Cardigann definition.
 */
export interface CardigannField {
  attribute?: string;
  /** YAML declaration order defines first-match precedence for case selectors. */
  case?: Record<string, number | string>;
  /** Template used when an optional field's value is blank. */
  default?: number | string;
  filters?: CardigannFilter[];
  optional?: boolean;
  remove?: string;
  selector?: string;
  text?: number | string;
}

/**
 * Search path definition in a Cardigann definition.
 */
export interface CardigannPath {
  categories?: string[];
  headers?: Record<string, string>;
  inputs?: Record<string, number | string>;
  method?: 'get' | 'post';
  path: string;
  response?: {
    type?: 'html' | 'json' | 'xml';
  };
}

/**
 * How a Cardigann definition signs in: posting `inputs` to `path`, sending them as a GET
 * query, submitting the form found on the login page, or using a configured session cookie.
 */
export type CardigannLoginMethod = 'cookie' | 'form' | 'get' | 'post';

/**
 * Login flow specification in a Cardigann definition.
 */
export interface CardigannLogin {
  error?: Array<{
    message?: {
      selector?: string;
      text?: string;
    };
    selector: string;
  }>;
  /** Selector of the login page form that `method: form` submits; defaults to `form`. */
  form?: string;
  inputs?: Record<string, number | string>;
  /** Defaults to `post`. */
  method?: CardigannLoginMethod;
  path?: string;
  /** Overrides the form's `action` for `method: form`. */
  submitpath?: string;
  test?: {
    path: string;
    selector?: string;
  };
}

/**
 * Capabilities defined in a Cardigann definition.
 */
export interface CardigannCaps {
  allowrawsearch?: boolean;
  allowtvsearchimdb?: boolean;
  categories?: Record<string, string>;
  /**
   * Raw definition mapping list.
   * @deprecated Use `categorymappings` instead.
   */
  categorymapping?: TrackerCategoryMapping[];
  categorymappings?: TrackerCategoryMapping[];
  modes?: Record<string, string[]>;
}

/**
 * Search section of a Cardigann definition.
 */
export interface CardigannSearch {
  allowemptyinputs?: boolean;
  error?: Array<{
    message?: {
      selector?: string;
      text?: string;
    };
    selector: string;
  }>;
  fields: Record<string, CardigannField>;
  headers?: Record<string, string | string[]>;
  inputs?: Record<string, number | string>;
  keywordsfilters?: CardigannFilter[];
  paths: CardigannPath[];
  rows: {
    after?: number;
    filters?: CardigannFilter[];
    selector: string;
  };
}

/**
 * Topic details specification in a Cardigann definition.
 */
export interface CardigannDetails {
  path?: string;
}

/**
 * Tracker setting configuration item in a Cardigann definition.
 */
export interface CardigannSetting {
  default?: boolean | number | string;
  label?: string;
  name: string;
  /** Values a `select` setting accepts, keyed by the value with its label. */
  options?: Record<string, string>;
  type?: string;
}

/**
 * Complete Cardigann YAML definition structure compatible with Jackett.
 */
export interface CardigannDefinition {
  caps?: CardigannCaps;
  description?: string;
  details?: CardigannDetails;
  encoding?: string;
  id?: string;
  language?: string;
  legacylinks?: string[];
  links: string[];
  login?: CardigannLogin;
  name: string;
  /** Minimum number of seconds between the starts of consecutive requests to the tracker. */
  requestDelay?: number;
  search: CardigannSearch;
  settings?: CardigannSetting[];
  site?: string;
  trackers?: string[];
  type?: 'private' | 'public' | 'semi-private';
}

/**
 * A Cardigann template flag: Jackett sets a request flag to `True` when it holds and leaves it
 * empty otherwise.
 */
export type TemplateFlag = 'True' | undefined;

/**
 * Evaluation context for Cardigann templates.
 */
export interface TemplateContext {
  Categories?: (number | string)[];
  Category?: number | string;
  Config?: Record<string, boolean | number | string>;
  Id?: number | string;
  Keywords?: string;
  Query?: {
    APIKey?: string;
    Album?: string;
    Artist?: string;
    Author?: string;
    Categories?: number[];
    Category?: number | string;
    DoubanID?: string;
    Ep?: string;
    Episode?: string;
    Extended?: string;
    Format?: number;
    Genre?: string;
    IMDBID?: string;
    IMDBIDShort?: string;
    IsBookSearch?: TemplateFlag;
    IsDoubanQuery?: TemplateFlag;
    IsGenreQuery?: TemplateFlag;
    IsIdSearch?: TemplateFlag;
    IsImdbQuery?: TemplateFlag;
    IsMovieSearch?: TemplateFlag;
    IsMusicSearch?: TemplateFlag;
    IsRssSearch?: TemplateFlag;
    IsSearch?: TemplateFlag;
    IsTVRageQuery?: TemplateFlag;
    IsTVSearch?: TemplateFlag;
    IsTmdbQuery?: TemplateFlag;
    IsTraktQuery?: TemplateFlag;
    IsTvdbQuery?: TemplateFlag;
    IsTvmazeQuery?: TemplateFlag;
    /** Search term, release year, and episode tag joined with spaces, before keyword filters. */
    Keywords?: string;
    Label?: string;
    Limit?: string;
    Movie?: string;
    Offset?: string;
    /** Search term without the episode tag. */
    Q?: string;
    /** Keywords after the definition's keyword filters, the same value as `.Keywords`. */
    Query?: string;
    Season?: string;
    Series?: string;
    TMDBID?: string;
    TVDBID?: string;
    TVMazeID?: string;
    TVRageID?: string;
    Title?: string;
    Track?: string;
    TraktID?: string;
    /** Torznab request type, such as `search`, `tvsearch`, or `movie`. */
    Type?: string;
    Year?: string;
  };
  Result?: Record<string, string>;
  Today?: {
    Year: number;
  };
  id?: number | string;
}
