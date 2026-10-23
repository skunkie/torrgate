// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import fs from 'node:fs';

import YAML from 'yaml';

import { CardigannDefinition, CardigannField } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value: unknown): value is number | string {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function isField(value: unknown): value is CardigannField {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, entry]) => {
    switch (key) {
      case 'attribute':
      case 'remove':
      case 'selector':
        return typeof entry === 'string';
      case 'case':
        return isRecord(entry) && Object.values(entry).every(isScalar);
      case 'filters':
        return Array.isArray(entry) && entry.every(filter =>
          isRecord(filter) && typeof filter.name === 'string' && Object.keys(filter).every(key => key === 'args' || key === 'name') &&
          (filter.args === undefined || isScalar(filter.args) || (Array.isArray(filter.args) && filter.args.every(isScalar)))
        );
      case 'optional':
        return typeof entry === 'boolean';
      case 'default':
      case 'text':
        return isScalar(entry);
      default:
        return false;
    }
  });
}

function isFields(value: unknown): value is Record<string, CardigannField> {
  return isRecord(value) && Object.values(value).every(isField);
}

function isSearchOverride(value: unknown): value is { fields: Record<string, CardigannField> } {
  return isRecord(value) && Object.keys(value).every(key => key === 'fields') && isFields(value.fields);
}

export function applyDefinitionOverride(definition: CardigannDefinition, overridePath: string): CardigannDefinition {
  try {
    let content: string;
    try {
      content = fs.readFileSync(overridePath, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return definition;
      throw error;
    }
    const override: unknown = YAML.parse(content);
    if (!isRecord(override) || Object.keys(override).length === 0 || Object.keys(override).some(key => key !== 'search' && key !== 'trackers')) {
      throw new Error('Expected search.fields or a trackers list');
    }
    const search = override.search;
    const trackers = override.trackers;
    if (search !== undefined && !isSearchOverride(search)) throw new Error('Expected search.fields containing complete Cardigann field declarations');
    if (trackers !== undefined && (!Array.isArray(trackers) || !trackers.every((tracker: unknown) => typeof tracker === 'string' && tracker.trim() !== ''))) {
      throw new Error('Expected trackers to be a list of nonempty strings');
    }
    return {
      ...definition,
      search: search === undefined ? definition.search : {
        ...definition.search,
        fields: { ...definition.search.fields, ...search.fields },
      },
      ...(trackers === undefined ? {} : { trackers }),
    };
  } catch (error) {
    console.warn(`[TorrGate] Failed to load definition override ${overridePath}; using the base definition:`, error);
    return definition;
  }
}
