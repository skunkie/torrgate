// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import fs from 'node:fs';
import path from 'node:path';

export interface GetOpenApiSpecOptions {
  env?: NodeJS.ProcessEnv;
  filePath?: string;
  forceReload?: boolean;
}

interface CachedSpec {
  content: string;
  version: string;
}

let cachedSpec: CachedSpec | null = null;

function cleanVersionTag(raw: string): string {
  return raw.replace(/^refs\/tags\//, '').replace(/^v/, '').trim();
}

function isValidVersionString(version: string): boolean {
  return /^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(cleanVersionTag(version));
}

function resolveVersion(env: NodeJS.ProcessEnv): string {
  const explicit = env.TORRGATE_VERSION || env.OPENAPI_VERSION;
  if (explicit && isValidVersionString(explicit)) return cleanVersionTag(explicit);

  if (env.npm_package_version && isValidVersionString(env.npm_package_version)) {
    return cleanVersionTag(env.npm_package_version);
  }

  return '1.0.0';
}

/**
 * Loads the OpenAPI specification YAML file and injects the resolved API version.
 */
export function getOpenApiSpec(options?: GetOpenApiSpecOptions): string {
  const resolvedVersion = resolveVersion(options?.env ?? process.env);

  if (!options?.forceReload && cachedSpec && cachedSpec.version === resolvedVersion) {
    return cachedSpec.content;
  }

  const specPath = options?.filePath ?? path.resolve(process.cwd(), 'openapi.yaml');
  const rawYaml = fs.readFileSync(specPath, 'utf8');

  const updatedYaml = rawYaml.replace(
    /^(\s*version:\s*)['"']?[^'"\n\r]+['"']?/m,
    `$1${resolvedVersion}`
  );

  cachedSpec = {
    content: updatedYaml,
    version: resolvedVersion,
  };

  return updatedYaml;
}

/**
 * Resets the in-memory OpenAPI specification cache (primarily for tests).
 */
export function resetOpenApiSpecCache(): void {
  cachedSpec = null;
}
