// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderTemplate } from '../../src/providers/template.js';
import { TemplateContext } from '../../src/providers/types.js';

describe('Cardigann Template Evaluator', () => {
  it('should interpolate top-level variables', () => {
    const context: TemplateContext = {
      Keywords: 'sample query',
      Page: 2,
    };
    const template = 'search/{{ .Page }}?q={{ .Keywords }}';
    const result = renderTemplate(template, context);
    assert.equal(result, 'search/2?q=sample query');
  });

  it('should interpolate nested object properties', () => {
    const context: TemplateContext = {
      Query: {
        Page: 3,
        Query: 'sample nested',
      },
      Result: {
        category_id: '42',
      },
    };
    const template = 'page={{ .Query.Page }}&id={{ .Result.category_id }}';
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
