// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TrackerCategoryMapping } from '../../types/provider.js';
import { CardigannCaps } from './types.js';

export function getDefinitionCategoryMappings(caps?: CardigannCaps): TrackerCategoryMapping[] {
  return [
    ...Object.entries(caps?.categories ?? {}).map(([id, cat]) => ({ cat, id })),
    ...(caps?.categorymappings ?? caps?.categorymapping ?? []),
  ];
}
