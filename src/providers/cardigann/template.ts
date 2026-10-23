// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TemplateContext } from './types.js';

type AstNode =
  | { branches: Array<{ body: AstNode[]; condition?: string }>; type: 'if' }
  | { index: number; path: string; type: 'index' }
  | { body: AstNode[]; path: string; type: 'range' }
  | { type: 'text'; value: string }
  | { path: string; type: 'var' };

function getNestedValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const parts = path.replace(/^\./, '').split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value !== undefined && value !== null;
}

function resolveValue(path: string, context: TemplateContext, currentItem?: unknown): unknown {
  const trimmed = path.trim();
  if (trimmed === '.') {
    return currentItem;
  }

  const joinMatch = trimmed.match(/^join\s+(\.[\w.]+)\s+"([^"]*)"$/);
  if (joinMatch) {
    const values = getNestedValue(context, joinMatch[1]);
    return Array.isArray(values) ? values.map(String).join(joinMatch[2]) : '';
  }

  const orMatch = trimmed.match(/^or\s+(\S+)\s+(\S+)$/);
  if (orMatch) {
    const leftValue = resolveValue(orMatch[1], context, currentItem);
    if (isTruthy(leftValue)) {
      return leftValue;
    }
    return resolveValue(orMatch[2], context, currentItem);
  }

  return getNestedValue(context, trimmed);
}

function evaluateCondition(
  condition: string,
  context: TemplateContext,
  currentItem?: unknown
): boolean {
  const trimmed = condition.trim();

  // Handle "and (leftExpression) (rightExpression)" or "and arg1 arg2"
  const andMatch = trimmed.match(/^and(?:\s+\((.+)\)\s+\((.+)\)|\s+(\S+)\s+(\S+))$/);
  if (andMatch) {
    const leftExpression = andMatch[1] || andMatch[3];
    const rightExpression = andMatch[2] || andMatch[4];
    return (
      evaluateCondition(leftExpression, context, currentItem) &&
      evaluateCondition(rightExpression, context, currentItem)
    );
  }

  // Handle "or (leftExpression) (rightExpression)" or "or arg1 arg2"
  const orMatch = trimmed.match(/^or(?:\s+\((.+)\)\s+\((.+)\)|\s+(\S+)\s+(\S+))$/);
  if (orMatch) {
    const leftExpression = orMatch[1] || orMatch[3];
    const rightExpression = orMatch[2] || orMatch[4];
    return (
      evaluateCondition(leftExpression, context, currentItem) ||
      evaluateCondition(rightExpression, context, currentItem)
    );
  }

  // Handle "ne leftValue rightValue"
  const neMatch = trimmed.match(/^ne\s+(\S+)\s+"?([^"]*)"?$/);
  if (neMatch) {
    const leftValue = String(resolveValue(neMatch[1], context, currentItem) ?? '');
    const rightValue = neMatch[2];
    return leftValue !== rightValue;
  }

  // Handle "eq leftValue rightValue"
  const eqMatch = trimmed.match(/^eq\s+(\S+)\s+"?([^"]*)"?$/);
  if (eqMatch) {
    const leftValue = String(resolveValue(eqMatch[1], context, currentItem) ?? '');
    const rightValue = eqMatch[2];
    return leftValue === rightValue;
  }

  // Simple variable truthiness check
  const value = resolveValue(trimmed, context, currentItem);
  return isTruthy(value);
}

interface StackFrame {
  body: AstNode[];
  branches?: Array<{ body: AstNode[]; condition?: string }>;
  kind: 'if' | 'range' | 'root';
  path?: string;
}

function parseTemplate(template: string): AstNode[] {
  const tagRegex = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  const rootFrame: StackFrame = { body: [], kind: 'root' };
  const stack: StackFrame[] = [rootFrame];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(template)) !== null) {
    const textBefore = template.slice(lastIndex, match.index);
    if (textBefore.length > 0) {
      stack[stack.length - 1].body.push({ type: 'text', value: textBefore });
    }
    lastIndex = tagRegex.lastIndex;

    const tagContent = match[1].trim();

    if (tagContent.startsWith('range ')) {
      const rangePath = tagContent.slice(6).trim();
      const newFrame: StackFrame = { body: [], kind: 'range', path: rangePath };
      stack.push(newFrame);
    } else if (tagContent.startsWith('if ')) {
      const condition = tagContent.slice(3).trim();
      const firstBranch: { body: AstNode[]; condition: string } = { body: [], condition };
      const newFrame: StackFrame = {
        body: firstBranch.body,
        branches: [firstBranch],
        kind: 'if',
      };
      stack.push(newFrame);
    } else if (tagContent.startsWith('else if ')) {
      const top = stack[stack.length - 1];
      if (top && top.kind === 'if' && top.branches) {
        const condition = tagContent.slice(8).trim();
        const branch: { body: AstNode[]; condition: string } = { body: [], condition };
        top.branches.push(branch);
        top.body = branch.body;
      }
    } else if (tagContent === 'else') {
      const top = stack[stack.length - 1];
      if (top && top.kind === 'if' && top.branches) {
        const branch: { body: AstNode[] } = { body: [] };
        top.branches.push(branch);
        top.body = branch.body;
      }
    } else if (tagContent === 'end') {
      if (stack.length <= 1) {
        throw new Error('Unexpected {{ end }} tag with no matching opening block');
      }
      const popped = stack.pop()!;
      const parent = stack[stack.length - 1];
      if (popped.kind === 'range') {
        parent.body.push({ body: popped.body, path: popped.path!, type: 'range' });
      } else if (popped.kind === 'if') {
        parent.body.push({ branches: popped.branches!, type: 'if' });
      }
    } else if (tagContent.startsWith('index ')) {
      const parts = tagContent.split(/\s+/);
      stack[stack.length - 1].body.push({
        index: parseInt(parts[2], 10),
        path: parts[1],
        type: 'index',
      });
    } else {
      stack[stack.length - 1].body.push({
        path: tagContent,
        type: 'var',
      });
    }
  }

  if (stack.length > 1) {
    const unclosed = stack[stack.length - 1];
    throw new Error(`Unclosed {{ ${unclosed.kind} }} block in template`);
  }

  if (lastIndex < template.length) {
    stack[stack.length - 1].body.push({
      type: 'text',
      value: template.slice(lastIndex),
    });
  }

  return rootFrame.body;
}

function evaluateNodes(
  nodes: AstNode[],
  context: TemplateContext,
  currentItem?: unknown,
  encodeValue: (value: string) => string = value => value,
  inspectValue?: (value: unknown) => void
): string {
  let output = '';

  for (const node of nodes) {
    if (node.type === 'text') {
      output += node.value;
    } else if (node.type === 'var') {
      const value = resolveValue(node.path, context, currentItem);
      inspectValue?.(value);
      if (value !== undefined && value !== null) {
        output += encodeValue(String(value));
      }
    } else if (node.type === 'index') {
      const list = getNestedValue(context, node.path);
      inspectValue?.(Array.isArray(list) ? list[node.index] : undefined);
      if (Array.isArray(list) && list[node.index] !== undefined) {
        output += encodeValue(String(list[node.index]));
      }
    } else if (node.type === 'range') {
      const list = getNestedValue(context, node.path);
      if (Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          output += evaluateNodes(node.body, context, item, encodeValue, inspectValue);
        }
      }
    } else if (node.type === 'if') {
      for (const branch of node.branches) {
        if (!branch.condition || evaluateCondition(branch.condition, context, currentItem)) {
          output += evaluateNodes(branch.body, context, currentItem, encodeValue, inspectValue);
          break;
        }
      }
    }
  }

  return output;
}

/**
 * Evaluates a Cardigann Go-style template string against a context.
 */
export function renderTemplate(
  template: string,
  context: TemplateContext,
  encodeValue?: (value: string) => string
): string {
  if (!template || typeof template !== 'string') {
    return '';
  }

  const ast = parseTemplate(template);
  return evaluateNodes(ast, context, undefined, encodeValue);
}

/**
 * Checks emitted variables, allowing missing settings in conditions and inactive branches.
 */
export function hasTemplateValues(template: string, context: TemplateContext): boolean {
  let hasValues = true;
  evaluateNodes(parseTemplate(template), context, undefined, undefined, value => {
    if (value === undefined || value === null || String(value).trim() === '') hasValues = false;
  });
  return hasValues;
}
