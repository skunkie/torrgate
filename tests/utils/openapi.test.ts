// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import ts from 'typescript';
import { isMap, isSeq, parseDocument } from 'yaml';

import { getInspectionCategories } from '../../src/api/category-mappings.js';
import { normalizeImdbId } from '../../src/utils/imdb.js';
import { getOpenApiSpec, resetOpenApiSpecCache } from '../../src/utils/openapi.js';

function findInvalidNullabilityPaths(document: unknown): string[] {
  type ObjectKind = 'callback' | 'components' | 'document' | 'encoding' | 'mediaType' | 'operation' | 'parameter' | 'pathItem' | 'requestBody' | 'response' | 'schema';
  type ChildRule = readonly [ObjectKind, 'array' | 'map' | 'object'];
  const childRules: Record<Exclude<ObjectKind, 'callback' | 'schema'>, Record<string, ChildRule>> = {
    components: {
      callbacks: ['callback', 'map'],
      headers: ['parameter', 'map'],
      parameters: ['parameter', 'map'],
      pathItems: ['pathItem', 'map'],
      requestBodies: ['requestBody', 'map'],
      responses: ['response', 'map'],
      schemas: ['schema', 'map'],
    },
    document: {
      components: ['components', 'object'],
      paths: ['pathItem', 'map'],
      webhooks: ['pathItem', 'map'],
    },
    encoding: { headers: ['parameter', 'map'] },
    mediaType: { encoding: ['encoding', 'map'], schema: ['schema', 'object'] },
    operation: {
      callbacks: ['callback', 'map'],
      parameters: ['parameter', 'array'],
      requestBody: ['requestBody', 'object'],
      responses: ['response', 'map'],
    },
    parameter: { content: ['mediaType', 'map'], schema: ['schema', 'object'] },
    pathItem: {
      delete: ['operation', 'object'],
      get: ['operation', 'object'],
      head: ['operation', 'object'],
      options: ['operation', 'object'],
      parameters: ['parameter', 'array'],
      patch: ['operation', 'object'],
      post: ['operation', 'object'],
      put: ['operation', 'object'],
      trace: ['operation', 'object'],
    },
    requestBody: { content: ['mediaType', 'map'] },
    response: { content: ['mediaType', 'map'], headers: ['parameter', 'map'] },
  };
  const paths: string[] = [];
  const schemaTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
  const schemaMaps = new Set(['$defs', 'definitions', 'dependentSchemas', 'patternProperties', 'properties']);
  const schemaChildren = new Set([
    'additionalItems', 'additionalProperties', 'allOf', 'anyOf', 'contains', 'contentSchema',
    'else', 'if', 'items', 'not', 'oneOf', 'prefixItems', 'propertyNames', 'then',
    'unevaluatedItems', 'unevaluatedProperties',
  ]);
  const childPath = (parent: string, key: string): string => `${parent}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  const inspectSchema = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspectSchema(entry, childPath(path, String(index))));
      return;
    }
    if (!isRecord(value)) return;
    if (Object.hasOwn(value, 'nullable')) paths.push(childPath(path, 'nullable'));
    if (Object.hasOwn(value, 'type')) {
      const types: unknown[] = Array.isArray(value.type) ? value.type : [value.type];
      if (types.length === 0 || new Set(types).size !== types.length || types.some(type => typeof type !== 'string' || !schemaTypes.has(type))) {
        paths.push(childPath(path, 'type'));
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const location = childPath(path, key);
      if (schemaMaps.has(key) && isRecord(child)) {
        for (const [name, schema] of Object.entries(child)) inspectSchema(schema, childPath(location, name));
      } else if (schemaChildren.has(key)) {
        inspectSchema(child, location);
      }
    }
  };

  const inspectDocument = (value: unknown, path: string, kind: ObjectKind): void => {
    if (kind === 'schema') {
      inspectSchema(value, path);
      return;
    }
    if (!isRecord(value)) return;
    if (kind === 'callback') {
      for (const [expression, pathItem] of Object.entries(value)) {
        if (expression !== '$ref' && !expression.startsWith('x-')) {
          inspectDocument(pathItem, childPath(path, expression), 'pathItem');
        }
      }
      return;
    }
    for (const [key, [childKind, mode]] of Object.entries(childRules[kind])) {
      const child = value[key];
      const location = childPath(path, key);
      if (mode === 'map' && isRecord(child)) {
        const hasExtensions = (kind === 'document' && key === 'paths') || (kind === 'operation' && key === 'responses');
        for (const [name, entry] of Object.entries(child)) {
          if (!hasExtensions || !name.startsWith('x-')) inspectDocument(entry, childPath(location, name), childKind);
        }
      } else if (mode === 'array' && Array.isArray(child)) {
        child.forEach((entry, index) => inspectDocument(entry, childPath(location, String(index)), childKind));
      } else if (mode === 'object') {
        inspectDocument(child, location, childKind);
      }
    }
  };

  inspectDocument(document, '#', 'document');
  return paths;
}

describe('OpenAPI response schemas', () => {
  it('should use OpenAPI 3.1 nullability throughout the specification', () => {
    const spec = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    assert.deepEqual(findInvalidNullabilityPaths(spec.toJS()), []);
  });

  it('should reject legacy nullability on newly added fields and nested schemas', () => {
    const spec = {
      components: {
        schemas: {
          Sample: {
            $defs: { Nested: { nullable: false, type: 'integer' } },
            properties: {
              NewField: { items: { anyOf: [{ nullable: true, type: 'string' }] }, type: 'array' },
            },
          },
        },
      },
    };
    assert.deepEqual(findInvalidNullabilityPaths(spec), [
      '#/components/schemas/Sample/$defs/Nested/nullable',
      '#/components/schemas/Sample/properties/NewField/items/anyOf/0/nullable',
    ]);
  });

  it('should reject legacy nullability in inline request schemas', () => {
    const spec = {
      paths: {
        '/sample': {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { nullable: true, type: 'string' } } },
            },
          },
        },
      },
    };
    assert.deepEqual(findInvalidNullabilityPaths(spec), ['#/paths/~1sample/post/requestBody/content/application~1json/schema/nullable']);
  });

  it('should inspect reusable parameter and response schemas regardless of component names', () => {
    for (const name of ['example', 'examples', 'schema', 'x-sample']) {
      const spec = {
        components: {
          parameters: {
            [name]: { in: 'query', name: 'sample', schema: { nullable: true, type: 'string' } },
          },
          responses: {
            [name]: {
              content: { 'application/json': { schema: { nullable: true, type: 'string' } } },
              description: 'Sample response',
            },
          },
        },
      };
      assert.deepEqual(findInvalidNullabilityPaths(spec), [
        `#/components/parameters/${name}/schema/nullable`,
        `#/components/responses/${name}/content/application~1json/schema/nullable`,
      ]);
    }
  });

  it('should inspect inline response headers regardless of header names', () => {
    for (const name of ['example', 'examples', 'schema', 'x-sample']) {
      const spec = {
        paths: {
          '/sample': {
            get: {
              responses: {
                '200': {
                  description: 'Sample response',
                  headers: { [name]: { schema: { nullable: true, type: 'string' } } },
                },
              },
            },
          },
        },
      };
      assert.deepEqual(findInvalidNullabilityPaths(spec), [
        `#/paths/~1sample/get/responses/200/headers/${name}/schema/nullable`,
      ]);
    }
  });

  it('should inspect path items in webhooks and reusable and inline callbacks', () => {
    const pathItem = {
      post: { parameters: [{ in: 'query', name: 'sample', schema: { nullable: true, type: 'string' } }] },
    };
    for (const name of ['example', 'examples', 'schema', 'x-sample']) {
      const spec = {
        components: {
          callbacks: { [name]: { '{$request.query.callbackUrl}': pathItem } },
          pathItems: { [name]: pathItem },
        },
        paths: {
          '/sample': { get: { callbacks: { [name]: { '{$request.query.callbackUrl}': pathItem } } } },
        },
        webhooks: { [name]: pathItem },
      };
      assert.deepEqual(findInvalidNullabilityPaths(spec), [
        `#/components/callbacks/${name}/{$request.query.callbackUrl}/post/parameters/0/schema/nullable`,
        `#/components/pathItems/${name}/post/parameters/0/schema/nullable`,
        `#/paths/~1sample/get/callbacks/${name}/{$request.query.callbackUrl}/post/parameters/0/schema/nullable`,
        `#/webhooks/${name}/post/parameters/0/schema/nullable`,
      ]);
    }
  });

  it('should inspect parameter content and multipart encoding header schemas', () => {
    const spec = {
      paths: {
        '/sample': {
          parameters: [{
            content: { 'application/json': { schema: { nullable: true, type: 'string' } } },
            in: 'query',
            name: 'sample',
          }],
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  encoding: {
                    example: { headers: { schema: { schema: { nullable: true, type: 'string' } } } },
                  },
                },
              },
            },
          },
        },
      },
    };
    assert.deepEqual(findInvalidNullabilityPaths(spec), [
      '#/paths/~1sample/parameters/0/content/application~1json/schema/nullable',
      '#/paths/~1sample/post/requestBody/content/multipart~1form-data/encoding/example/headers/schema/schema/nullable',
    ]);
  });

  it('should reject malformed type unions including an unquoted YAML null', () => {
    const spec = parseDocument(`components:
  schemas:
    Sample:
      properties:
        DuplicateType:
          type: [string, "null", "null"]
        EmptyUnion:
          type: []
        InvalidType:
          type: nullable
        UnquotedNull:
          type: [string, null]
`).toJS();
    assert.deepEqual(findInvalidNullabilityPaths(spec), [
      '#/components/schemas/Sample/properties/DuplicateType/type',
      '#/components/schemas/Sample/properties/EmptyUnion/type',
      '#/components/schemas/Sample/properties/InvalidType/type',
      '#/components/schemas/Sample/properties/UnquotedNull/type',
    ]);
  });

  it('should allow new null unions, null-only schemas, and nullable names in example data and properties', () => {
    const spec = {
      components: {
        examples: { Sample: { value: { schema: { nullable: true } } } },
        schemas: {
          Sample: {
            additionalProperties: { type: ['integer', 'null'] },
            examples: [{ nullable: true, schema: { nullable: true } }],
            properties: {
              NewField: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              nullable: { type: ['boolean', 'null'] },
              schema: { type: ['string', 'null'] },
            },
            'x-sample': { nullable: true },
          },
        },
        'x-sample': { schema: { nullable: true } },
      },
      paths: {
        '/sample': {
          get: {
            responses: {
              '200': {
                content: { 'application/json': { example: { schema: { nullable: true } }, schema: true } },
                links: { Sample: { operationId: 'sample', parameters: { schema: { nullable: true } } } },
              },
              'x-sample': { content: { 'application/json': { schema: { nullable: true } } } },
            },
          },
        },
        'x-sample': { get: { parameters: [{ schema: { nullable: true } }] } },
      },
    };
    assert.deepEqual(findInvalidNullabilityPaths(spec), []);
  });

  it('should declare nullable response values with OpenAPI 3.1 type unions', () => {
    const spec = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    const fields = [
      ['JackettIndexerStatus', 'Error', 'string'],
      ['JackettResultItem', 'BlackholeLink', 'string'],
      ['JackettResultItem', 'Description', 'string'],
      ['JackettResultItem', 'Files', 'integer'],
      ['JackettResultItem', 'Grabs', 'integer'],
      ['JackettResultItem', 'InfoHash', 'string'],
      ['JackettResultItem', 'Link', 'string'],
      ['JackettResultItem', 'MagnetUri', 'string'],
      ['JackettResultItem', 'Poster', 'string'],
      ['JackettResultItem', 'DownloadVolumeFactor', 'number'],
      ['JackettResultItem', 'MinimumRatio', 'number'],
      ['JackettResultItem', 'MinimumSeedTime', 'integer'],
      ['JackettResultItem', 'UploadVolumeFactor', 'number'],
    ];
    for (const [schema, field, valueType] of fields) {
      const type = spec.getIn(['components', 'schemas', schema, 'properties', field, 'type']);
      assert.ok(isSeq(type), `${schema}.${field}`);
      assert.deepEqual(type.toJSON(), [valueType, 'null'], `${schema}.${field}`);
    }
    assert.equal(spec.getIn(['components', 'schemas', 'JackettResultItem', 'properties', 'Poster', 'format']), 'uri');
  });
});

describe('OpenAPI search contract consistency', () => {
  it('should allow the numeric IDs returned by the category inspection endpoint', () => {
    const document = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    const type = document.getIn(['components', 'schemas', 'CategoryMapping', 'properties', 'id', 'type']);
    const categories = getInspectionCategories([{ cat: 'Movies', id: '1.5' }, { cat: 'TV', id: 'sample-section' }]);
    for (const category of categories) {
      assert.ok(type === 'number' || (type === 'integer' && Number.isInteger(category.id)), String(category.id));
    }
  });

  it('should match Jackett wire interface fields and required properties', () => {
    const document = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    const file = ts.createSourceFile('jackett.ts', fs.readFileSync(new URL('../../src/jackett/types.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of file.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text === 'JackettIndexerCaps') continue;
      const fields = statement.members.filter(ts.isPropertySignature);
      const names = fields.map(field => field.name.getText(file)).sort();
      const required = fields.filter(field => field.questionToken === undefined).map(field => field.name.getText(file)).sort();
      const schema = document.getIn(['components', 'schemas', statement.name.text, 'properties']);
      assert.ok(isMap(schema));
      assert.deepEqual(Object.keys(schema.toJSON()), names, statement.name.text);
      const requiredSchema = document.getIn(['components', 'schemas', statement.name.text, 'required']);
      assert.ok(isSeq(requiredSchema));
      assert.deepEqual(requiredSchema.toJSON(), required, statement.name.text);
    }
  });

  it('should keep the Torznab alias parameters and responses synchronized', () => {
    const document = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    for (const field of ['parameters', 'responses']) {
      const alias = document.getIn(['paths', '/{indexer}/results/torznab', 'get', field]);
      const canonical = document.getIn(['paths', '/{indexer}/results/torznab/api', 'get', field]);
      assert.deepEqual(JSON.parse(JSON.stringify(alias)), JSON.parse(JSON.stringify(canonical)), field);
    }
  });

  it('should describe raw coerced parameters as strings and validate the Torznab IMDb pattern', () => {
    const document = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    const parameters = document.getIn(['paths', '/{indexer}/results/torznab/api', 'get', 'parameters']);
    assert.ok(isSeq(parameters));
    for (const name of ['extended', 'limit', 'offset']) {
      const parameter: unknown = parameters.items.find(item => isMap(item) && item.get('name') === name);
      assert.ok(isMap(parameter));
      assert.equal(parameter.getIn(['schema', 'type']), 'string');
      assert.equal(parameter.getIn(['schema', 'default']), '0');
    }
    const imdb = parameters.items.find(item => isMap(item) && item.get('name') === 'imdbid');
    assert.ok(isMap(imdb));
    const pattern = imdb.getIn(['schema', 'pattern']);
    assert.equal(typeof pattern, 'string');
    const regex = new RegExp(String(pattern));
    for (const value of ['123', 'tt12345678', 'tt12345678\n', '0000042', 'tt0', '00000000', 'TT123', 'tt123456789', ' tt123', 'tt123 ', 'tt123\r\n']) {
      assert.equal(regex.test(value), normalizeImdbId(value) != null, JSON.stringify(value));
    }
  });

  it('should show gain without rounding in a result example', () => {
    const document = parseDocument(fs.readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));
    const example = (field: string): unknown => document.getIn(['components', 'schemas', 'JackettResultItem', 'properties', field, 'example']);
    assert.equal(example('Gain'), Number(example('Seeders')) * (Number(example('Size')) / 1024 / 1024 / 1024));
  });
});

describe('OpenAPI Spec Injector', () => {
  let tempDir: string;
  let tempYamlPath: string;

  beforeEach(() => {
    resetOpenApiSpecCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torrgate-openapi-test-'));
    tempYamlPath = path.join(tempDir, 'openapi.yaml');
    fs.writeFileSync(
      tempYamlPath,
      'openapi: 3.1.0\ninfo:\n  title: TorrGate API\n  version: 1.0.0\n  description: Sample API\n',
      'utf8'
    );
  });

  afterEach(() => {
    resetOpenApiSpecCache();
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  it('should inject version from TORRGATE_VERSION, stripping the v prefix', () => {
    const spec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v3.1.2' },
      filePath: tempYamlPath,
      shouldForceReload: true,
    });
    assert.match(spec, /version: 3\.1\.2/);
  });

  it('should fall back to npm_package_version', () => {
    const spec = getOpenApiSpec({
      env: { npm_package_version: '1.9.0' },
      filePath: tempYamlPath,
      shouldForceReload: true,
    });
    assert.match(spec, /version: 1\.9\.0/);
  });

  it('should use the safe default when environment is empty', () => {
    const spec = getOpenApiSpec({
      env: {},
      filePath: tempYamlPath,
      shouldForceReload: true,
    });
    assert.match(spec, /version: 1\.0\.0/);
  });

  it('should replace the version field and preserve other fields', () => {
    const spec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v2.8.4' },
      filePath: tempYamlPath,
      shouldForceReload: true,
    });

    assert.match(spec, /version: 2\.8\.4/);
    assert.match(spec, /title: TorrGate API/);
  });

  it('should reuse cached spec and read updated content when forced to reload', () => {
    const initialSpec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
    });
    assert.match(initialSpec, /version: 1\.0\.1/);

    fs.writeFileSync(
      tempYamlPath,
      'openapi: 3.1.0\ninfo:\n  title: TorrGate API\n  version: 9.9.9\n  description: Updated sample API\n',
      'utf8'
    );

    const cachedSpec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
    });
    assert.equal(cachedSpec, initialSpec);

    const reloadedSpec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
      shouldForceReload: true,
    });
    assert.match(reloadedSpec, /version: 1\.0\.1/);
    assert.match(reloadedSpec, /description: Updated sample API/);
    assert.equal(getOpenApiSpec({ env: { TORRGATE_VERSION: 'v1.0.1' }, filePath: tempYamlPath }), reloadedSpec);
  });
});
