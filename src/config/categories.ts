// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CardigannProvider } from '../providers/cardigann-provider.js';
import { CardigannCategoryMapping, CardigannDefinition } from '../providers/types.js';
import { TrackerProvider } from '../types/provider.js';
import { CategoryMapping } from '../types/torrent.js';

/**
 * Target providing category mappings (either a tracker provider or a Cardigann definition).
 */
export type CategorySource = CardigannDefinition | TrackerProvider;

/**
 * Returns the Cardigann category mappings of a provider or definition.
 */
export function getCategoryMappings(target: CategorySource): CardigannCategoryMapping[] {
  if (target instanceof CardigannProvider) {
    return target.definition.caps?.categorymappings ?? [];
  }
  if ('search' in target) {
    return target.caps?.categorymappings ?? [];
  }
  return [];
}

/**
 * Extracts category mappings from a tracker provider or Cardigann definition.
 */
export function getCategoriesForProvider(target: CategorySource): CategoryMapping[] {
  return getCategoryMappings(target).map(m => ({
    id: typeof m.id === 'number' ? m.id : parseInt(String(m.id), 10),
    name: m.desc || m.cat,
  }));
}
