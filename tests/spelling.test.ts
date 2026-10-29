// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const CSPELL_PATH = fileURLToPath(import.meta.resolve('cspell/bin'));
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function checkSpelling(text: string, filename: string) {
  const result = spawnSync(process.execPath, [
    CSPELL_PATH, 'lint', '--config', 'cspell.config.mjs', '--no-progress', '--no-summary', `stdin://${filename}`,
  ], { cwd: PROJECT_ROOT, encoding: 'utf8', input: text, timeout: 30_000 });
  assert.ifError(result.error);
  return { output: result.stdout + result.stderr, status: result.status };
}

describe('American English spelling checks', () => {
  it('accepts American English in documentation and code comments', () => {
    for (const filename of ['spelling-example.md', 'src/spelling-example.ts']) {
      const result = checkSpelling('// The player recognizes the normalized color and summarizes its behavior.', filename);
      assert.equal(result.status, 0, result.output);
    }
  });

  it('reports British spelling and ordinary typos', () => {
    const text = 'The player recognises and summmarizes the result.';
    const result = checkSpelling(text, 'spelling-example.md');
    assert.equal(result.status, 1, result.output);
    for (const word of ['recognises', 'summmarizes']) assert.ok(result.output.includes(word), result.output);
    const quoted = checkSpelling('<!-- cspell:disable-next-line -->\n> ' + text, 'spelling-example.md');
    assert.equal(quoted.status, 0, quoted.output);
  });

  it('preserves project names, code references, Russian text, and encoded fixture data', () => {
    const result = checkSpelling(
      '// TorrGate uses `Example.Reguest` with Jackett and Prowlarr.\n'
      + '// Русский текст остается без проверки.\n'
      + 'const encoded = "xt%3Durn%3Abtih%3A123";',
      'src/spelling-example.ts'
    );
    assert.equal(result.status, 0, result.output);
  });

  it('skips code and fixture data while checking comments and documentation', () => {
    const fixture = 'Sintl';
    const allowed = checkSpelling(`const resultKey = '${fixture}'; const comment = '/* ${fixture} */';`, 'tests/spelling-example.ts');
    assert.equal(allowed.status, 0, allowed.output);
    const comment = checkSpelling(`// ${fixture}`, 'tests/spelling-example.ts');
    assert.equal(comment.status, 1, comment.output);
    const rejected = checkSpelling(fixture, 'spelling-example.md');
    assert.equal(rejected.status, 1, rejected.output);
    assert.ok(rejected.output.includes(fixture), rejected.output);
  });

  it('checks OpenAPI descriptions and leaves schema identifiers alone', () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: Sample API\n  description: The service recognises requests.\npaths: {}\ncomponents:\n  schemas:\n    recognises: {}\n';
    const result = checkSpelling(text, 'openapi.yaml');
    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes('openapi.yaml:4:'), result.output);
    assert.ok(!result.output.includes('openapi.yaml:8:'), result.output);
    const example = checkSpelling('example:\n  title: Colour\n  description: recognises\n', 'openapi.yaml');
    assert.equal(example.status, 0, example.output);
    const namedProperty = checkSpelling('components:\n  schemas:\n    example:\n      properties:\n        default:\n          description: recognises\n', 'openapi.yaml');
    assert.equal(namedProperty.status, 1, namedProperty.output);
    assert.ok(namedProperty.output.includes('recognises'), namedProperty.output);
    const reusable = checkSpelling('components:\n  examples:\n    sample:\n      summary: Colour choices\n      value:\n        title: recognises\n', 'openapi.yaml');
    assert.equal(reusable.status, 1, reusable.output);
    assert.ok(reusable.output.includes('Colour'), reusable.output);
    assert.ok(!reusable.output.includes('recognises'), reusable.output);
    const schemaExamples = checkSpelling('components:\n  schemas:\n    Sample:\n      examples:\n        - title: Colour\n          description: recognises\n', 'openapi.yaml');
    assert.equal(schemaExamples.status, 0, schemaExamples.output);
  });

  it('checks browser HTML and embedded script messages', () => {
    const html = checkSpelling('const page = `<button title="Colour settings">Recognise</button>`;', 'src/web/example.ts');
    assert.equal(html.status, 1, html.output);
    assert.ok(html.output.includes('Colour'), html.output);
    assert.ok(html.output.includes('Recognise'), html.output);
    const script = checkSpelling("const script = String.raw`showToast('The service recognises requests.'); const item = { label: 'Colour' };`;", 'src/web/client/example.ts');
    assert.equal(script.status, 1, script.output);
    assert.ok(script.output.includes('recognises'), script.output);
    assert.ok(script.output.includes('Colour'), script.output);
    const interpolated = checkSpelling('const page = `<span>${value} recognises</span>`;', 'src/web/example.ts');
    assert.equal(interpolated.status, 1, interpolated.output);
    assert.ok(interpolated.output.includes('recognises'), interpolated.output);
    const between = checkSpelling('const page = `<span>Colour ${first} recognises ${second}</span>`;', 'src/web/example.ts');
    assert.equal(between.status, 1, between.output);
    assert.ok(between.output.includes('Colour'), between.output);
    assert.ok(between.output.includes('recognises'), between.output);
    const attribute = checkSpelling('const page = `<button title="Colour ${value} recognises">OK</button>`;', 'src/web/example.ts');
    assert.equal(attribute.status, 1, attribute.output);
    assert.ok(attribute.output.includes('Colour'), attribute.output);
    assert.ok(attribute.output.includes('recognises'), attribute.output);
    const fallback = checkSpelling("const script = String.raw`showToast(error.message || 'Colour error');`;", 'src/web/example.ts');
    assert.equal(fallback.status, 1, fallback.output);
    assert.ok(fallback.output.includes('Colour'), fallback.output);
    const message = checkSpelling('showToast(`Colour for ${identifierMistake} recognises ${secondIdentifier} settings`);', 'src/web/example.ts');
    assert.equal(message.status, 1, message.output);
    assert.ok(message.output.includes('Colour'), message.output);
    assert.ok(message.output.includes('recognises'), message.output);
    assert.ok(!message.output.includes('identifierMistake'), message.output);
    const comment = checkSpelling('const script = String.raw`\n// recognises colour\nconst value = "fixtureMistake";\n`;', 'src/web/example.ts');
    assert.equal(comment.status, 1, comment.output);
    assert.ok(comment.output.includes('recognises'), comment.output);
    assert.ok(comment.output.includes('colour'), comment.output);
    assert.ok(!comment.output.includes('fixtureMistake'), comment.output);
  });

  it('checks raw HTML text and attributes', () => {
    const result = checkSpelling(
      'const page = String.raw`<button title="Colour">Recognise</button>`;',
      'src/web/example.ts'
    );
    assert.equal(result.status, 1, result.output);
    for (const word of ['Colour', 'Recognise']) assert.ok(result.output.includes(word), result.output);
    assert.ok(result.output.includes('src/web/example.ts:1:40'), result.output);
    assert.ok(result.output.includes('src/web/example.ts:1:48'), result.output);
  });

  it('checks raw HTML fragments with leading and trailing text', () => {
    const result = checkSpelling(
      'const page = String.raw`recognises <button title="Colour">Recognise</button> colour`;',
      'src/web/example.ts'
    );
    assert.equal(result.status, 1, result.output);
    for (const word of ['recognises', 'Colour', 'Recognise', 'colour']) assert.ok(result.output.includes(word), result.output);
  });

  it('checks concatenated HTML prose without checking JavaScript expressions', () => {
    const result = checkSpelling(
      "const script = String.raw`element.innerHTML = '<p>Colour ' + escapeHtml(reguest) + ' recognises</p>';`;",
      'src/web/client/example.ts'
    );
    assert.equal(result.status, 1, result.output);
    for (const word of ['Colour', 'recognises']) assert.ok(result.output.includes(word), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
  });

  it('checks parenthesized conditional browser text and tooltips', () => {
    const result = checkSpelling(
      "const script = String.raw`element.innerHTML = '<button title=\"' + (reguest ? 'Colour' : 'Recognise') + '\">' + (reguest ? 'recognises' : 'colour') + '</button>';`;",
      'src/web/client/example.ts'
    );
    assert.equal(result.status, 1, result.output);
    for (const word of ['Colour', 'Recognise', 'recognises', 'colour']) assert.ok(result.output.includes(word), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
  });

  it('checks stylesheet template comments while excluding CSS string values', () => {
    const result = checkSpelling(
      'export const STYLES = String.raw`\n.example { content: "/* reguest */"; color: /* recognises colour */ red; }`;',
      'src/web/client/styles/example-styles.ts'
    );
    assert.equal(result.status, 1, result.output);
    for (const word of ['recognises', 'colour']) assert.ok(result.output.includes(word), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
  });

  it('checks OpenAPI Markdown prose while excluding inline and fenced examples', () => {
    const result = checkSpelling(
      'info:\n  description: |\n    Use `reguest` to recognize settings.\n\n    ~~~ts\n    reguest();\n    ~~~\n\n    The service recognises requests.\n',
      'openapi.yaml'
    );
    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes('recognises'), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
    assert.ok(result.output.includes('openapi.yaml:9:17'), result.output);
  });

  it('checks prose around escaped YAML Markdown examples at their source positions', () => {
    const content = 'info:\n  description: "Example:\\n\\n~~~ts\\nreguest();\\n~~~\\n\\nThe service recognises requests."\n';
    const result = checkSpelling(content, 'openapi.yaml');
    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes('recognises'), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
    const column = content.split('\n')[1].indexOf('recognises') + 1;
    assert.ok(result.output.includes('openapi.yaml:2:' + column), result.output);
  });

  it('excludes code-only OpenAPI descriptions with explicit YAML indentation', () => {
    const result = checkSpelling(
      'info:\n  description: |2-\n        reguest();\n  summary: The service recognises requests.\n',
      'openapi.yaml'
    );
    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes('recognises'), result.output);
    assert.ok(!result.output.includes('reguest'), result.output);
    assert.ok(result.output.includes('openapi.yaml:4:24'), result.output);
  });

  it('excludes tilde-fenced Markdown code while still checking the following prose', () => {
    const code = '~~~ts\nconst recognises = true;\n~~~\n';
    const accepted = checkSpelling(code + '\nThe player recognizes the result.', 'spelling-example.md');
    assert.equal(accepted.status, 0, accepted.output);
    const rejected = checkSpelling(code + '\nThe player recognises the result.', 'spelling-example.md');
    assert.equal(rejected.status, 1, rejected.output);
    assert.ok(rejected.output.includes('spelling-example.md:5:12'), rejected.output);
  });
});
