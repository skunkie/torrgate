// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import { HttpClient } from '../http/http-client.js';
import { CardigannProvider } from './cardigann-provider.js';
import { CardigannDefinition } from './types.js';

/**
 * Loads all Cardigann YAML definitions from a directory and instantiates providers.
 */
export function loadDefinitionsFromDir(
  definitionsDir: string,
  httpClient: HttpClient
): CardigannProvider[] {
  const providers: CardigannProvider[] = [];

  if (!fs.existsSync(definitionsDir)) {
    return providers;
  }

  try {
    const entries = fs.readdirSync(definitionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue;

      const filePath = path.join(definitionsDir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = YAML.parse(content) as CardigannDefinition;

        const id = parsed.id || parsed.site;
        if (
          parsed &&
          id &&
          parsed.name &&
          parsed.search &&
          parsed.search.rows &&
          parsed.search.fields
        ) {
          parsed.id = id;
          if (parsed.caps && parsed.caps.categorymapping && !parsed.caps.categorymappings) {
            parsed.caps.categorymappings = parsed.caps.categorymapping;
          }
          providers.push(new CardigannProvider(parsed, httpClient));
        }
      } catch (err) {
        console.warn(`[TorrGate] Failed to parse definition ${entry.name}:`, err);
      }
    }
  } catch (err) {
    console.warn(`[TorrGate] Failed to read definitions directory ${definitionsDir}:`, err);
  }

  return providers;
}
