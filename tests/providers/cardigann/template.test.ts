// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasTemplateValues, renderTemplate } from '../../../src/providers/cardigann/template.js';
import { TemplateContext } from '../../../src/providers/cardigann/types.js';

describe('Cardigann Template Evaluator', () => {
  it('should join category lists using the Cardigann join expression', () => {
    assert.equal(renderTemplate('{{ join .Categories "," }}', { Categories: [22, 9] }), '22,9');
    assert.equal(renderTemplate('{{ join .Categories "," }}', { Categories: [] }), '');
  });

  it('should encode interpolated values while preserving raw query separators', () => {
    const context: TemplateContext = { Categories: [11, 22], Keywords: 'Пример & Sample' };
    const rendered = renderTemplate('q={{ .Keywords }}&{{ range .Categories }}f[]={{ . }}&{{ end }}', context, encodeURIComponent);
    const params = new URLSearchParams(rendered);
    assert.equal(params.get('q'), 'Пример & Sample');
    assert.deepEqual(params.getAll('f[]'), ['11', '22']);
  });

  it('should interpolate top-level variables', () => {
    const context: TemplateContext = {
      Id: 2,
      Keywords: 'sample query',
    };
    const template = 'search/{{ .Id }}?q={{ .Keywords }}';
    const result = renderTemplate(template, context);
    assert.equal(result, 'search/2?q=sample query');
  });

  it('should interpolate nested object properties', () => {
    const context: TemplateContext = {
      Query: {
        Category: 3,
        Query: 'sample nested',
      },
      Result: {
        category_id: '42',
      },
    };
    const template = 'page={{ .Query.Category }}&id={{ .Result.category_id }}';
    const result = renderTemplate(template, context);
    assert.equal(result, 'page=3&id=42');
  });

  it('should evaluate if-else conditional branches', () => {
    const contextWithCategories: TemplateContext = {
      Categories: [1, 5],
    };
    const contextWithoutCategories: TemplateContext = {
      Categories: [],
    };
    const template = '{{ if .Categories }}cat-present{{ else }}cat-missing{{ end }}';

    assert.equal(renderTemplate(template, contextWithCategories), 'cat-present');
    assert.equal(renderTemplate(template, contextWithoutCategories), 'cat-missing');
  });

  it('should evaluate index expressions inside arrays', () => {
    const context: TemplateContext = {
      Categories: [100, 200],
    };
    const template = 'f={{ index .Categories 0 }}';
    const result = renderTemplate(template, context);
    assert.equal(result, 'f=100');
  });

  it('should evaluate range loops over arrays', () => {
    const context: TemplateContext = {
      Categories: [1, 2, 3],
    };
    const template = 'cats={{ range .Categories }}{{.}},{{ end }}';
    const result = renderTemplate(template, context);
    assert.equal(result, 'cats=1,2,3,');
  });

  it('should evaluate ne (not-equal) and eq (equal) conditions', () => {
    const context: TemplateContext = {
      Result: {
        category_id: '10',
      },
    };
    const templateNe = '{{ if ne .Result.category_id "999" }}not-999{{ else }}is-999{{ end }}';
    assert.equal(renderTemplate(templateNe, context), 'not-999');

    const templateEq = '{{ if eq .Result.category_id "10" }}is-10{{ else }}not-10{{ end }}';
    assert.equal(renderTemplate(templateEq, context), 'is-10');
  });

  it('should evaluate compound and/or expressions', () => {
    const context: TemplateContext = {
      Config: {
        flagA: 'yes',
        flagB: 'no',
      },
    };

    const templateAnd = '{{ if and (eq .Config.flagA "yes") (eq .Config.flagB "no") }}both{{ else }}neither{{ end }}';
    assert.equal(renderTemplate(templateAnd, context), 'both');

    const templateAndFail = '{{ if and (eq .Config.flagA "yes") (eq .Config.flagB "yes") }}both{{ else }}not-both{{ end }}';
    assert.equal(renderTemplate(templateAndFail, context), 'not-both');

    const templateOr = '{{ if or (eq .Config.flagA "yes") (eq .Config.flagB "yes") }}either{{ else }}neither{{ end }}';
    assert.equal(renderTemplate(templateOr, context), 'either');

    const templateOrFail = '{{ if or (eq .Config.flagA "no") (eq .Config.flagB "yes") }}either{{ else }}neither{{ end }}';
    assert.equal(renderTemplate(templateOrFail, context), 'neither');

    const templateOrUnparenthesized = '{{ if or .Config.flagA .Config.missing }}found{{ else }}missing{{ end }}';
    assert.equal(renderTemplate(templateOrUnparenthesized, context), 'found');

    const templateOrExpression = '{{ or .Config.missing .Config.flagA }}';
    assert.equal(renderTemplate(templateOrExpression, context), 'yes');
  });

  it('should evaluate boolean conditions safely', () => {
    const contextTrue: TemplateContext = {
      Config: {
        stripcyrillic: true,
      },
    };
    const contextFalse: TemplateContext = {
      Config: {
        stripcyrillic: false,
      },
    };
    const template = '{{ if .Config.stripcyrillic }}stripped{{ else }}kept{{ end }}';
    assert.equal(renderTemplate(template, contextTrue), 'stripped');
    assert.equal(renderTemplate(template, contextFalse), 'kept');
  });

  it('should evaluate numeric conditions with zero as falsy', () => {
    const contextZero: TemplateContext = {
      Query: {
        Category: 0,
      },
    };
    const contextNonZero: TemplateContext = {
      Query: {
        Category: 123,
      },
    };
    const template = '{{ if .Query.Category }}{{ .Query.Category }}{{ else }}-1{{ end }}';
    assert.equal(renderTemplate(template, contextZero), '-1');
    assert.equal(renderTemplate(template, contextNonZero), '123');
  });

  it('should evaluate nested if blocks correctly without premature ending', () => {
    const contextBoth: TemplateContext = {
      Config: { a: '1', b: '1' },
    };
    const contextOuterOnly: TemplateContext = {
      Config: { a: '1', b: '' },
    };
    const contextNeither: TemplateContext = {
      Config: { a: '', b: '' },
    };

    const template =
      '{{ if .Config.a }}[outer-start:{{ if .Config.b }}both{{ else }}only-a{{ end }}:outer-end]{{ else }}neither{{ end }}';

    assert.equal(renderTemplate(template, contextBoth), '[outer-start:both:outer-end]');
    assert.equal(renderTemplate(template, contextOuterOnly), '[outer-start:only-a:outer-end]');
    assert.equal(renderTemplate(template, contextNeither), 'neither');
  });

  it('should evaluate else-if conditional chains', () => {
    const template =
      '{{ if eq .Result.category_id "1" }}first{{ else if eq .Result.category_id "2" }}second{{ else }}fallback{{ end }}';

    assert.equal(renderTemplate(template, { Result: { category_id: '1' } }), 'first');
    assert.equal(renderTemplate(template, { Result: { category_id: '2' } }), 'second');
    assert.equal(renderTemplate(template, { Result: { category_id: '3' } }), 'fallback');
  });

  it('should evaluate nested range and conditionals together', () => {
    const context: TemplateContext = {
      Categories: ['10', '20', '30'],
    };
    const template =
      '{{ range .Categories }}{{ if eq . "20" }}HIT{{ else }}{{ . }}{{ end }};{{ end }}';
    assert.equal(renderTemplate(template, context), '10;HIT;30;');
  });

  it('should throw syntax error on unmatched end tag', () => {
    assert.throws(
      () => renderTemplate('hello {{ end }}', {}),
      /Unexpected \{\{ end \}\} tag with no matching opening block/
    );
  });

  it('should throw syntax error on unclosed block', () => {
    assert.throws(
      () => renderTemplate('{{ if .Keywords }}missing end', { Keywords: 'sample' }),
      /Unclosed \{\{ if \}\} block in template/
    );
  });
});

describe('required template values', () => {
  it('should check only emitted variables in the selected branches', () => {
    const template = '{{ if .Config.token }}{{ .Config.token }}{{ else }}{{ .Config.username }}{{ end }}';
    assert.equal(hasTemplateValues(template, { Config: { username: 'sample-user' } }), true);
    assert.equal(hasTemplateValues(template, { Config: { token: 'sample-token' } }), true);
    assert.equal(hasTemplateValues(template, {}), false);
    assert.equal(hasTemplateValues('literal .Config.token', {}), true);
    assert.equal(hasTemplateValues('{{ .Config.token }}', { Config: { token: '  ' } }), false);
  });

  it('should accept false and zero values and evaluate fallback expressions', () => {
    assert.equal(hasTemplateValues('{{ .Config.enabled }}:{{ .Config.level }}', { Config: { enabled: false, level: 0 } }), true);
    assert.equal(hasTemplateValues('{{ or .Config.token .Config.username }}', { Config: { username: 'sample-user' } }), true);
    assert.equal(hasTemplateValues('{{ or .Config.token .Config.username }}', {}), false);
  });

  it('should validate indices and each emitted range item', () => {
    assert.equal(hasTemplateValues('{{ index .Categories 0 }}', { Categories: [1] }), true);
    assert.equal(hasTemplateValues('{{ index .Categories 1 }}', { Categories: [1] }), false);
    assert.equal(hasTemplateValues('{{ range .Categories }}{{ . }}{{ end }}', { Categories: ['1', '2'] }), true);
    assert.equal(hasTemplateValues('{{ range .Categories }}{{ . }}{{ end }}', { Categories: ['1', ''] }), false);
  });
});
