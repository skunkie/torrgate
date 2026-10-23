// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { createIndexersRouter } from '../../src/api/routes.js';
import { HttpClient } from '../../src/http/http-client.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

interface SpecParameter {
  in: string;
  name: string;
}

interface RouterLayer {
  route?: { methods: Record<string, boolean>; path: string };
}

type SpecPaths = Record<string, Record<string, { parameters?: SpecParameter[] }>>;

const HTTP_METHODS = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);

function loadSpecPaths(): SpecPaths {
  const spec = parse(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8')) as { paths: SpecPaths };
  return spec.paths;
}

/**
 * Lists the indexers router's routes as `method path`, with Express `:param` segments
 * written as OpenAPI `{param}` templates.
 */
function listRouterOperations(): string[] {
  const router = createIndexersRouter(new ProviderRegistry(new HttpClient()));
  return (router.stack as RouterLayer[]).flatMap(layer => {
    if (!layer.route) return [];
    const path = layer.route.path.replace(/:(\w+)/g, '{$1}');
    return Object.keys(layer.route.methods).map(method => `${method} ${path}`);
  });
}

describe('OpenAPI route coverage', () => {
  it('should document exactly the operations the indexers router serves', () => {
    const specOperations = Object.entries(loadSpecPaths()).flatMap(([path, pathItem]) =>
      Object.keys(pathItem)
        .filter(method => HTTP_METHODS.has(method))
        .map(method => `${method} ${path}`)
    );

    assert.deepEqual([...specOperations].sort(), [...listRouterOperations()].sort());
  });

  it('should declare every path template variable as a path parameter', () => {
    for (const [path, pathItem] of Object.entries(loadSpecPaths())) {
      const templateNames = [...path.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method)) continue;
        const pathParameterNames = (operation.parameters ?? [])
          .filter(parameter => parameter.in === 'path')
          .map(parameter => parameter.name)
          .sort();
        assert.deepEqual(pathParameterNames, templateNames, `${method} ${path}`);
      }
    }
  });
});
