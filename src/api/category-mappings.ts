// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { torznabIdForName } from '../jackett/categories/catalog.js';
import { TrackerCategoryMapping } from '../types/provider.js';
import { CategoryMapping } from '../types/torrent.js';

export function getInspectionCategories(mappings: TrackerCategoryMapping[]): CategoryMapping[] {
  return mappings.map(mapping => ({
    id: Number.isFinite(Number(mapping.id)) ? Number(mapping.id) : torznabIdForName(mapping.cat) ?? 8000,
    name: mapping.desc || mapping.cat,
  }));
}
