// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { getOpenApiSpec, resetOpenApiSpecCache } from '../../src/utils/openapi.js';

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
      env: { OPENAPI_VERSION: '2.0.0', TORRGATE_VERSION: 'v3.1.2' },
      filePath: tempYamlPath,
      forceReload: true,
    });
    assert.match(spec, /version: 3\.1\.2/);
  });

  it('should fall back to OPENAPI_VERSION when TORRGATE_VERSION is absent', () => {
    const spec = getOpenApiSpec({
      env: { OPENAPI_VERSION: '2.5.0' },
      filePath: tempYamlPath,
      forceReload: true,
    });
    assert.match(spec, /version: 2\.5\.0/);
  });

  it('should fall back to npm_package_version', () => {
    const spec = getOpenApiSpec({
      env: { npm_package_version: '1.9.0' },
      filePath: tempYamlPath,
      forceReload: true,
    });
    assert.match(spec, /version: 1\.9\.0/);
  });

  it('should use the safe default when environment is empty', () => {
    const spec = getOpenApiSpec({
      env: {},
      filePath: tempYamlPath,
      forceReload: true,
    });
    assert.match(spec, /version: 1\.0\.0/);
  });

  it('should replace the version field and preserve other fields', () => {
    const spec = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v2.8.4' },
      filePath: tempYamlPath,
      forceReload: true,
    });

    assert.match(spec, /version: 2\.8\.4/);
    assert.match(spec, /title: TorrGate API/);
  });

  it('should reuse cached spec on subsequent calls unless forceReload is set', () => {
    const spec1 = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
    });
    assert.match(spec1, /version: 1\.0\.1/);

    // Mutate underlying file
    fs.writeFileSync(tempYamlPath, 'openapi: 3.1.0\ninfo:\n  version: 9.9.9\n', 'utf8');

    const spec2 = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
    });
    assert.equal(spec2, spec1);

    const spec3 = getOpenApiSpec({
      env: { TORRGATE_VERSION: 'v1.0.1' },
      filePath: tempYamlPath,
      forceReload: true,
    });
    assert.match(spec3, /version: 1\.0\.1/);
  });
});
