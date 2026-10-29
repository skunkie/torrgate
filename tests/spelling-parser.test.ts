// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractCssProse, extractMarkdownProse, extractOpenApiProse, extractSourceProse } from '../spelling-parser.mjs';

describe('Spelling prose extraction', () => {
  it('checks real source comments while excluding strings, regular expressions, and template text', () => {
    const content = [
      'const first = "/* fixtureOne */";',
      "const second = '// fixtureTwo';",
      'const expression = /https?:\\/\\/fixtureThree/;',
      'const template = `/* fixtureFour */ ${value /* interpolationNote */} // fixtureFive`;',
      'call(/* argumentNote */);',
      'function empty() { /* bodyNote */ }',
      '// finalNote',
    ].join('\n');
    const prose = extractSourceProse(content, 'src/example.ts');

    for (const word of ['interpolationNote', 'argumentNote', 'bodyNote', 'finalNote']) assert.ok(prose.includes(word), word);
    for (const word of ['fixtureOne', 'fixtureTwo', 'fixtureThree', 'fixtureFour', 'fixtureFive', 'value']) assert.ok(!prose.includes(word), word);
    assert.equal(prose.length, content.length);
    assert.equal(prose.indexOf('finalNote'), content.indexOf('finalNote'));
  });

  it('keeps comments in files containing only comments', () => {
    assert.ok(extractSourceProse('// note', 'example.js').includes('note'));
    assert.ok(extractSourceProse('/* note */', 'example.mjs').includes('note'));
  });

  it('skips inline and fenced code in consecutive line comments and documentation blocks', () => {
    const content = [
      'function example() {',
      '  // Opening prose with `inlineCode`.',
      '  // ~~~js',
      '  // const hiddenCode = true;',
      '  // ~~~',
      '  /**',
      '   * Closing prose.',
      '   * ````ts',
      '   * nestedCode();',
      '   * ````',
      '   */',
      '}',
    ].join('\n');
    const prose = extractSourceProse(content, 'src/example.ts');

    assert.ok(prose.includes('Opening prose'));
    assert.ok(prose.includes('Closing prose'));
    for (const word of ['inlineCode', 'hiddenCode', 'nestedCode']) assert.ok(!prose.includes(word), word);
  });

  it('does not join comment fences across intervening source code', () => {
    const content = '// ```\nconst value = true;\n// Closing prose';
    assert.ok(extractSourceProse(content, 'src/example.ts').includes('Closing prose'));
  });

  it('keeps separate documentation blocks and comment paragraphs independent', () => {
    for (const content of [
      '/**\n * ```\n */\n/** Closing prose */',
      '// ```\n\n// Closing prose',
    ]) {
      assert.ok(extractSourceProse(content, 'src/example.ts').includes('Closing prose'));
    }
    assert.ok(extractCssProse('/* ``` */\n/* Closing prose */').includes('Closing prose'));
  });

  it('keeps source positions with CRLF newlines and characters outside the basic multilingual plane', () => {
    const content = 'const icon = "😀";\r\n// finalNote\r\n';
    const prose = extractSourceProse(content, 'src/example.ts');
    assert.equal(prose.length, content.length);
    assert.equal(prose.indexOf('finalNote'), content.indexOf('finalNote'));
    assert.equal(prose.split('\r\n').length, content.split('\r\n').length);
  });

  it('checks CSS comments inside declarations while ignoring comment-like strings', () => {
    const content = '.example { content: "/* fixtureValue */"; color: /* actualNote */ red; }';
    const prose = extractCssProse(content);
    assert.ok(prose.includes('actualNote'));
    assert.ok(!prose.includes('fixtureValue'));
    assert.equal(prose.indexOf('actualNote'), content.indexOf('actualNote'));
  });

  it('checks raw HTML templates and keeps text and attribute positions', () => {
    for (const markup of [
      '<button title="Opening prose">Closing prose</button>',
      '\r\n<!doctype html>\r\n<html><button title="Opening prose">Closing prose</button></html>',
      '\r\n<!-- Layout -->\r\n<button title="Opening prose">Closing prose</button>',
      '<button title="Opening prose ${identifierMistake}">Closing prose</button>',
    ]) {
      const content = 'const page = String.raw`' + markup + '`;';
      const prose = extractSourceProse(content, 'src/web/example.ts');

      for (const word of ['Opening prose', 'Closing prose']) {
        assert.ok(prose.includes(word), markup);
        assert.equal(prose.indexOf(word), content.indexOf(word));
      }
      assert.ok(!prose.includes('identifierMistake'));
      assert.equal(prose.length, content.length);
    }
  });

  it('checks leading and trailing prose in raw HTML fragments', () => {
    const content = 'const page = String.raw`Opening prose <button title="Color settings">Recognize settings</button> Closing prose`;';
    const prose = extractSourceProse(content, 'src/web/example.ts');

    for (const word of ['Opening prose', 'Closing prose', 'Color settings', 'Recognize settings']) {
      assert.ok(prose.includes(word), word);
      assert.equal(prose.indexOf(word), content.indexOf(word));
    }
    assert.equal(prose.length, content.length);
  });

  it('keeps valid raw JavaScript with markup in strings and comments in the script extractor', () => {
    const content = "const script = String.raw`// ~~~html\n// <button>hiddenCode</button>\n// ~~~\nconst fixture = '<p>' + identifierMistake + '</p>'; showToast('Closing prose');`;";
    const prose = extractSourceProse(content, 'src/web/client/example.ts');

    assert.ok(prose.includes('Closing prose'));
    for (const word of ['hiddenCode', 'identifierMistake', 'showToast']) assert.ok(!prose.includes(word), word);
  });

  it('checks concatenated browser HTML while excluding expressions and unrelated script values', () => {
    const content = "const script = String.raw`element.innerHTML = '<p>Opening prose ' + escapeHtml(identifierMistake) + ' closing prose</p>'; const fixture = 'fixtureMistake';`;";
    const prose = extractSourceProse(content, 'src/web/client/example.ts');

    for (const word of ['Opening prose', 'closing prose']) {
      assert.ok(prose.includes(word));
      assert.equal(prose.indexOf(word), content.indexOf(word));
    }
    for (const word of ['escapeHtml', 'identifierMistake', 'fixtureMistake']) assert.ok(!prose.includes(word), word);
    assert.equal(prose.length, content.length);
  });

  it('checks parenthesized browser text and attributes while excluding conditions', () => {
    for (const expression of [
      "'<p>' + (conditionValue ? 'Opening prose' : 'Closing prose') + '</p>'",
      "'<button title=\"' + ((conditionValue ? 'Opening prose' : 'Closing prose')) + '\">OK</button>'",
      "'<p>' + (fallbackValue || ('Opening prose' + 'Closing prose')) + '</p>'",
    ]) {
      const content = 'const script = String.raw`element.innerHTML = ' + expression + ';`;';
      const prose = extractSourceProse(content, 'src/web/client/example.ts');

      for (const word of ['Opening prose', 'Closing prose']) {
        assert.ok(prose.includes(word), expression);
        assert.equal(prose.indexOf(word), content.indexOf(word));
      }
      for (const word of ['conditionValue', 'fallbackValue']) assert.ok(!prose.includes(word), word);
      assert.equal(prose.length, content.length);
    }
  });

  it('checks embedded CSS comments with CSS tokenization and preserves their positions', () => {
    for (const tag of ['', 'String.raw']) {
      const content = 'export const STYLES = ' + tag + '`\r\n.example { content: "/* fixtureValue */"; color: /* actualNote */ red; }\r\n/* Closing prose. */`;';
      const prose = extractSourceProse(content, 'src/web/client/styles/example-styles.ts');

      for (const word of ['actualNote', 'Closing prose']) {
        assert.ok(prose.includes(word));
        assert.equal(prose.indexOf(word), content.indexOf(word));
      }
      assert.ok(!prose.includes('fixtureValue'));
      assert.equal(prose.length, content.length);
    }
  });

  it('excludes Markdown code in OpenAPI descriptions while preserving prose positions', () => {
    const content = [
      'info:',
      '  description: |',
      '    Opening prose with `inlineCode`.',
      '',
      '    ~~~ts',
      '    fencedCode();',
      '    ~~~',
      '',
      '        indentedCode();',
      '',
      '    Closing prose.',
      '  summary: Use `summaryCode` for requests.',
    ].join('\r\n');
    const prose = extractOpenApiProse(content);

    for (const word of ['Opening prose', 'Closing prose', 'requests']) {
      assert.ok(prose.includes(word));
      assert.equal(prose.indexOf(word), content.indexOf(word));
    }
    for (const word of ['inlineCode', 'fencedCode', 'indentedCode', 'summaryCode']) assert.ok(!prose.includes(word), word);
    assert.equal(prose.length, content.length);
  });

  it('decodes escaped Markdown in quoted YAML descriptions and preserves source positions', () => {
    for (const description of [
      '"Opening prose\\n\\n~~~ts\\nfixtureCode();\\n~~~\\n\\nClosing prose"',
      '"Opening prose \\u0060fixtureCode\\u0060 Closing prose"',
      '"Opening prose \\x60fixtureCode\\x60 Closing prose"',
      '"Opening prose \\U00000060fixtureCode\\U00000060 Closing prose"',
      '"Opening prose\\n\\n    fixtureCode();\\n\\nClosing prose"',
      '"Opening prose\r\n\r\n~~~ts\r\n\r\nfixtureCode();\r\n\r\n~~~\r\n\r\nClosing prose"',
      "'Opening prose\r\n\r\n~~~ts\r\n\r\nfixtureCode();\r\n\r\n~~~\r\n\r\nClosing prose'",
    ]) {
      const content = 'info:\n  description: ' + description.replaceAll('\r\n', '\r\n    ') + '\n';
      const prose = extractOpenApiProse(content);

      for (const word of ['Opening prose', 'Closing prose']) {
        assert.ok(prose.includes(word), description);
        assert.equal(prose.indexOf(word), content.indexOf(word));
      }
      assert.ok(!prose.includes('fixtureCode'), description);
      assert.equal(prose.length, content.length);
    }
  });

  it('preserves Markdown code indentation declared by YAML scalar headers', () => {
    for (const header of ['|2', '|2-', '|-2', '>2+', '>+2']) {
      for (const [prefix, indent] of [['info:', 2], ['items:\n  - info:', 6]] as const) {
        const content = prefix + '\n' + ' '.repeat(indent) + 'description: ' + header + ' # Header prose\r\n'
          + ' '.repeat(indent + 6) + 'indentedCode();\r\n'
          + ' '.repeat(indent) + 'summary: Closing prose.\r\n';
        const prose = extractOpenApiProse(content);

        assert.ok(!prose.includes('indentedCode'), content);
        assert.ok(prose.includes('Closing prose'), content);
        assert.equal(prose.indexOf('Closing prose'), content.indexOf('Closing prose'));
        assert.equal(prose.length, content.length);
      }
    }
  });

  it('excludes both Markdown fence styles, indented examples, and inline code', () => {
    const content = 'Opening prose `inlineCode`.\n\n~~~ts\ntildeCode\n~~~\n\n````\n```nestedCode```\n````\n\n    indentedCode\n\nClosing prose.';
    const prose = extractMarkdownProse(content);
    assert.ok(prose.includes('Opening prose'));
    assert.ok(prose.includes('Closing prose'));
    for (const word of ['inlineCode', 'tildeCode', 'nestedCode', 'indentedCode']) assert.ok(!prose.includes(word), word);
    assert.equal(prose.length, content.length);
    assert.equal(prose.indexOf('Closing prose'), content.indexOf('Closing prose'));
  });

  it('ignores an unclosed Markdown fence through the end of the document', () => {
    assert.ok(!extractMarkdownProse('Opening prose\n\n~~~js\nhiddenCode').includes('hiddenCode'));
  });
});
