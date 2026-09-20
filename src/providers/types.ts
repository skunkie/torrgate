// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

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
  filters?: CardigannFilter[];
  selector?: string;
  text?: number | string;
}

/**
 * Search path definition in a Cardigann definition.
 */
export interface CardigannPath {
  headers?: Record<string, string>;
  inputs?: Record<string, number | string>;
  method?: 'get' | 'post';
  path: string;
  response?: {
    type?: 'html' | 'json' | 'xml';
  };
}

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
  form?: string;
  inputs?: Record<string, number | string>;
  method?: 'form' | 'get' | 'post';
  path?: string;
  test?: {
    path: string;
    selector?: string;
  };
}

/**
 * Category mapping in a Cardigann definition.
 */
export interface CardigannCategoryMapping {
  cat: string;
  desc?: string;
  id: number | string;
}

/**
 * Capabilities defined in a Cardigann definition.
 */
export interface CardigannCaps {
  /**
   * Raw definition mapping list.
   * @deprecated Use normalized `categorymappings` instead.
   */
  categorymapping?: CardigannCategoryMapping[];
  categorymappings?: CardigannCategoryMapping[];
  modes?: Record<string, string[]>;
}

/**
 * Search section of a Cardigann definition.
 */
export interface CardigannSearch {
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
  name: string;
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
 * Evaluation context for Cardigann templates.
 */
export interface TemplateContext {
  Categories?: (number | string)[];
  Category?: number | string;
  Config?: Record<string, boolean | number | string>;
  id?: number | string;
  Id?: number | string;
  Keywords?: string;
  Page?: number;
  Query?: {
    Category?: number | string;
    Format?: number;
    Page?: number;
    Query?: string;
    Year?: number | string;
  };
  Result?: Record<string, string>;
  Today?: {
    Year: number;
  };
}
