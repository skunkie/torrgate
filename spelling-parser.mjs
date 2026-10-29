// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { isTokenComment, tokenize } from '@csstools/css-tokenizer';
import { fromMarkdown } from 'mdast-util-from-markdown';
import ts from 'typescript';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

function mask(content, ranges, shouldKeep = false) {
  const output = (shouldKeep ? content.replace(/[^\r\n]/g, ' ') : content).split('');
  for (const [start, end] of ranges) {
    for (let offset = start; offset < end; offset++) {
      output[offset] = shouldKeep ? content[offset] : (/[\r\n]/.test(content[offset]) ? content[offset] : ' ');
    }
  }
  return output.join('');
}

function forEachMarkdownCode(content, visitCode) {
  function visit(node) {
    if (node.type === 'code' || node.type === 'inlineCode') {
      visitCode(node.position);
    } else {
      node.children?.forEach(visit);
    }
  }
  visit(fromMarkdown(content));
}

export function extractMarkdownProse(content) {
  const ranges = [];
  forEachMarkdownCode(content, ({ end, start }) => ranges.push([start.offset, end.offset]));
  return mask(content, ranges);
}

function excludeCommentCode(content, ranges) {
  const grouped = [];
  for (const [start, end] of ranges.sort((first, second) => first[0] - second[0])) {
    const previous = grouped[grouped.length - 1];
    const isContinuingLineComment = previous
      && content.startsWith('//', previous[0])
      && content.startsWith('//', start)
      && /^[\t ]*\r?\n[\t ]*$/.test(content.slice(previous[1], start));
    if (isContinuingLineComment) previous[1] = end;
    else grouped.push([start, end]);
  }
  const codeRanges = [];
  for (const [start, end] of grouped) {
    const offsets = [];
    let lineStart = start;
    const lines = content.slice(start, end).split('\n').map(line => {
      const prefixLength = line.match(/^[\t ]*(?:\/\*+ ?|\/\/ ?|\* ?)?/)[0].length;
      offsets.push(lineStart + prefixLength);
      lineStart += line.length + 1;
      return line.slice(prefixLength).replace(/\*\/$/, '');
    });
    forEachMarkdownCode(lines.join('\n'), ({ end: codeEnd, start: codeStart }) => {
      codeRanges.push([offsets[codeStart.line - 1] + codeStart.column - 1, offsets[codeEnd.line - 1] + codeEnd.column - 1]);
    });
  }
  return mask(mask(content, ranges, true), codeRanges);
}

// Resolve escapes and folded line breaks separately to retain their source spans.
function decodeQuotedScalar(raw, start) {
  const sourceRanges = [];
  const escapeRanges = [];
  let text = '';
  const quote = raw[0];
  const tokens = quote === '"' ? /\\(?:\r?\n[ \t]*|x[\da-fA-F]{2}|u[\da-fA-F]{4}|U[\da-fA-F]{8}|[\s\S])|[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*|[\s\S]/g : /''|[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*|[\s\S]/g;
  for (const match of raw.slice(1, -1).matchAll(tokens)) {
    const from = start + 1 + match.index;
    const to = from + match[0].length;
    const isEscape = quote === '"' ? match[0].startsWith('\\') : match[0] === "''";
    const value = isEscape || match[0].includes('\n')
      ? parseDocument(quote + match[0] + quote).contents?.value ?? ''
      : match[0];
    text += value;
    for (let offset = 0; offset < value.length; offset++) sourceRanges.push([from, to]);
    if (isEscape) escapeRanges.push([from, to]);
  }
  return { escapeRanges, sourceRanges, text };
}

export function extractOpenApiProse(content) {
  const ranges = [];
  const codeRanges = [];
  function visit(node, isNamedMap = false, isExample = false) {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isNamedMap && isScalar(pair.key) && (['example', 'default', 'enum'].includes(pair.key.value) || (pair.key.value === 'examples' && isSeq(pair.value)) || (isExample && pair.key.value === 'value'))) continue;
        if (isScalar(pair.key) && ['description', 'summary', 'title'].includes(pair.key.value) && isScalar(pair.value) && pair.value.range) {
          const [start, end] = pair.value.range;
          ranges.push([start, end]);
          const raw = content.slice(start, end);
          if (pair.value.type === 'QUOTE_DOUBLE' || pair.value.type === 'QUOTE_SINGLE') {
            const { escapeRanges, sourceRanges, text } = decodeQuotedScalar(raw, start);
            codeRanges.push(...escapeRanges);
            forEachMarkdownCode(text, ({ end: codeEnd, start: codeStart }) => {
              const first = sourceRanges[codeStart.offset];
              const last = sourceRanges[codeEnd.offset - 1];
              if (first && last) codeRanges.push([first[0], last[1]]);
            });
            continue;
          }
          const lines = raw.split('\n');
          const isBlock = /^[>|]/.test(raw);
          const blockToken = pair.value.srcToken;
          const explicitIndent = blockToken?.type === 'block-scalar'
            ? /[1-9]/.exec(blockToken.props[0].source)?.[0]
            : undefined;
          const indent = isBlock
            ? explicitIndent === undefined
              ? Math.min(...lines.slice(1).filter(line => line.trim()).map(line => line.match(/^ */)[0].length))
              : blockToken.indent + Number(explicitIndent)
            : 0;
          const offsets = [];
          let lineStart = start;
          const markdown = lines.map((line, index) => {
            const prefixLength = isBlock ? (index === 0 ? line.length : Math.min(indent, line.length)) : 0;
            offsets.push(lineStart + prefixLength);
            lineStart += line.length + 1;
            return line.slice(prefixLength);
          }).join('\n');
          forEachMarkdownCode(markdown, ({ end: codeEnd, start: codeStart }) => {
            codeRanges.push([offsets[codeStart.line - 1] + codeStart.column - 1, offsets[codeEnd.line - 1] + codeEnd.column - 1]);
          });
        } else {
          const isExamples = !isNamedMap && isScalar(pair.key) && pair.key.value === 'examples';
          visit(pair.value, isExamples || (!isNamedMap && isScalar(pair.key) && ['properties', 'schemas', 'parameters', 'responses', 'headers', 'requestBodies', 'securitySchemes', 'links', 'callbacks', 'pathItems', 'content'].includes(pair.key.value)), isExamples || (isNamedMap && isExample));
        }
      }
    } else if (isSeq(node)) node.items.forEach(item => visit(item));
  }
  visit(parseDocument(content, { keepSourceTokens: true }).contents);
  return mask(mask(content, ranges, true), codeRanges);
}

function collectProseRanges(content, prose, ranges, baseOffset) {
  let start;
  for (let offset = 0; offset <= content.length; offset++) {
    const shouldKeep = offset < content.length && prose[offset] === content[offset] && /\S/.test(content[offset]);
    if (shouldKeep && start === undefined) start = offset;
    if (!shouldKeep && start !== undefined) {
      ranges.push([baseOffset + start, baseOffset + offset]);
      start = undefined;
    }
  }
}

function collectWebProse(content, source, ranges, baseOffset = 0, isStylesheet = false) {
  function addLiteral(node, targetRanges = ranges) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      targetRanges.push([baseOffset + node.getStart(source) + 1, baseOffset + node.end - 1]);
    } else if (ts.isTemplateExpression(node)) {
      targetRanges.push([baseOffset + node.head.getStart(source) + 1, baseOffset + node.head.end - 2]);
      for (const span of node.templateSpans) {
        targetRanges.push([baseOffset + span.literal.getStart(source) + 1, baseOffset + span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2)]);
      }
    } else if (ts.isParenthesizedExpression(node)) {
      addLiteral(node.expression, targetRanges);
    } else if (ts.isConditionalExpression(node)) {
      addLiteral(node.whenTrue, targetRanges);
      addLiteral(node.whenFalse, targetRanges);
    } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
      addLiteral(node.left, targetRanges);
      addLiteral(node.right, targetRanges);
    }
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && /^(label|placeholder|description|title)$/.test(node.name.getText(source))) addLiteral(node.initializer);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)
      && /^(textContent|placeholder|title)$/.test(node.left.name.text)) addLiteral(node.right);
    if (ts.isCallExpression(node) && /(?:^|\.)showToast$/.test(node.expression.getText(source))) node.arguments.forEach(argument => addLiteral(argument));
    if (isStylesheet && ts.isTaggedTemplateExpression(node)) {
      visit(node.template);
      return;
    }
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(source) === 'String.raw' && ts.isNoSubstitutionTemplateLiteral(node.template)) {
      const start = node.template.getStart(source) + 1;
      const script = content.slice(start, node.template.end - 1);
      const embeddedSource = ts.createSourceFile('embedded.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const hasMarkup = /<[a-z][a-z0-9-]*(?=[\s/>])/i.test(script);
      if (/^\s*<(?:[a-z]|!doctype\b|!--)/i.test(script) || (hasMarkup && embeddedSource.parseDiagnostics.length > 0)) {
        visit(node.template);
        return;
      }
      const embeddedComments = collectComments(script, embeddedSource);
      const prose = excludeCommentCode(script, embeddedComments);
      collectProseRanges(script, prose, ranges, baseOffset + start);
      collectWebProse(script, embeddedSource, ranges, baseOffset + start);
      return;
    }
    const isLiteral = ts.isStringLiteral(node) || ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node);
    if (isLiteral && (isStylesheet || (ts.isVariableDeclaration(node.parent) && /^(?:css|styles)$/.test(node.parent.name.getText(source))))) {
      const literalRanges = [];
      addLiteral(node, literalRanges);
      const start = node.getStart(source);
      const raw = content.slice(start, node.end);
      const css = mask(raw, literalRanges.map(([from, to]) => [from - baseOffset - start, to - baseOffset - start]), true);
      collectProseRanges(raw, extractCssProse(css), ranges, baseOffset + start);
      return;
    }
    if (isLiteral || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const start = node.getStart(source);
      const raw = content.slice(start, node.end);
      const literalRanges = [];
      addLiteral(node, literalRanges);
      const relativeRanges = literalRanges.map(([from, to]) => [from - baseOffset - start, to - baseOffset - start]);
      const html = mask(raw, relativeRanges, true);
      if (/<[a-z][a-z0-9-]*[\s>]/i.test(html)) {
        function addHtmlRange(from, to) {
          for (const [literalStart, literalEnd] of relativeRanges) {
            const rangeStart = Math.max(from, literalStart);
            const rangeEnd = Math.min(to, literalEnd);
            if (rangeStart < rangeEnd) ranges.push([baseOffset + start + rangeStart, baseOffset + start + rangeEnd]);
          }
        }
        const pattern = /(?:^|>)([^<>{}]+)(?=<|$)/g;
        for (const match of html.matchAll(pattern)) addHtmlRange(match.index + match[0].length - match[1].length, match.index + match[0].length);
        const attributes = /\b(?:aria-label|title|placeholder|alt|content)="([^"]+)"/g;
        for (const match of html.matchAll(attributes)) addHtmlRange(match.index + match[0].indexOf('"') + 1, match.index + match[0].length - 1);
      }
    }
    node.getChildren(source).forEach(visit);
  }
  visit(source);
}

function collectComments(content, source) {
  const comments = new Map();
  function visit(node) {
    for (const range of [...(ts.getLeadingCommentRanges(content, node.pos) || []), ...(ts.getTrailingCommentRanges(content, node.end) || [])]) {
      comments.set(range.pos, [range.pos, range.end]);
    }
    node.getChildren(source).forEach(visit);
  }
  visit(source);
  return [...comments.values()];
}

export function extractSourceProse(content, filename) {
  const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
  const commentRanges = collectComments(content, source);
  const prose = excludeCommentCode(content, commentRanges);
  if (!/(?:^|\/)src\/web\//.test(filename.replace(/\\/g, '/'))) return prose;
  const ranges = [];
  collectWebProse(content, source, ranges, 0, /(?:^|[-/])styles\.[cm]?[jt]s$/.test(filename));
  const output = prose.split('');
  for (const [start, end] of ranges) {
    for (let offset = start; offset < end; offset++) output[offset] = content[offset];
  }
  return output.join('');
}

export function extractCssProse(content) {
  const ranges = tokenize({ css: content }).filter(isTokenComment).map(token => [token[2], token[3] + 1]);
  return excludeCommentCode(content, ranges);
}

function createParser(name, extract) {
  return {
    name,
    parse: (content, filename) => ({
      content,
      filename,
      parsedTexts: [{ range: [0, content.length], text: extract(content, filename) }],
    }),
  };
}

export const spellingParsers = [
  createParser('torrgate-source', extractSourceProse),
  createParser('torrgate-markdown', extractMarkdownProse),
  createParser('torrgate-css', extractCssProse),
  createParser('torrgate-openapi', extractOpenApiProse),
];
