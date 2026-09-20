// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TemplateContext } from './types.js';

type ASTNode =
  | { branches: Array<{ body: ASTNode[]; condition?: string }>; type: 'if' }
  | { index: number; path: string; type: 'index' }
  | { body: ASTNode[]; path: string; type: 'range' }
  | { type: 'text'; value: string }
  | { path: string; type: 'var' };

function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const parts = path.replace(/^\./, '').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function isTruthy(val: unknown): boolean {
  if (Array.isArray(val)) {
    return val.length > 0;
  }
  if (typeof val === 'string') {
    return val.length > 0;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'number') {
    return val !== 0;
  }
  return val !== undefined && val !== null;
}

function resolveValue(path: string, context: TemplateContext, currentItem?: unknown): unknown {
  const trimmed = path.trim();
  if (trimmed === '.') {
    return currentItem;
  }

  const orMatch = trimmed.match(/^or\s+(\S+)\s+(\S+)$/);
  if (orMatch) {
    const val1 = resolveValue(orMatch[1], context, currentItem);
    if (isTruthy(val1)) {
      return val1;
    }
    return resolveValue(orMatch[2], context, currentItem);
  }

  return getNestedValue(context, trimmed);
}

function evaluateCondition(
  conditionStr: string,
  context: TemplateContext,
  currentItem?: unknown
): boolean {
  const trimmed = conditionStr.trim();

  // Handle "and (expr1) (expr2)" or "and arg1 arg2"
  const andMatch = trimmed.match(/^and(?:\s+\((.+)\)\s+\((.+)\)|\s+(\S+)\s+(\S+))$/);
  if (andMatch) {
    const expr1 = andMatch[1] || andMatch[3];
    const expr2 = andMatch[2] || andMatch[4];
    return (
      evaluateCondition(expr1, context, currentItem) &&
      evaluateCondition(expr2, context, currentItem)
    );
  }

  // Handle "or (expr1) (expr2)" or "or arg1 arg2"
  const orMatch = trimmed.match(/^or(?:\s+\((.+)\)\s+\((.+)\)|\s+(\S+)\s+(\S+))$/);
  if (orMatch) {
    const expr1 = orMatch[1] || orMatch[3];
    const expr2 = orMatch[2] || orMatch[4];
    return (
      evaluateCondition(expr1, context, currentItem) ||
      evaluateCondition(expr2, context, currentItem)
    );
  }

  // Handle "ne val1 val2"
  const neMatch = trimmed.match(/^ne\s+(\S+)\s+"?([^"]*)"?$/);
  if (neMatch) {
    const val1 = String(resolveValue(neMatch[1], context, currentItem) ?? '');
    const val2 = neMatch[2];
    return val1 !== val2;
  }

  // Handle "eq val1 val2"
  const eqMatch = trimmed.match(/^eq\s+(\S+)\s+"?([^"]*)"?$/);
  if (eqMatch) {
    const val1 = String(resolveValue(eqMatch[1], context, currentItem) ?? '');
    const val2 = eqMatch[2];
    return val1 === val2;
  }

  // Simple variable truthiness check
  const val = resolveValue(trimmed, context, currentItem);
  return isTruthy(val);
}

interface StackFrame {
  body: ASTNode[];
  branches?: Array<{ body: ASTNode[]; condition?: string }>;
  kind: 'if' | 'range' | 'root';
  path?: string;
}

function parseTemplate(templateStr: string): ASTNode[] {
  const tagRegex = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  const rootFrame: StackFrame = { body: [], kind: 'root' };
  const stack: StackFrame[] = [rootFrame];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(templateStr)) !== null) {
    const textBefore = templateStr.slice(lastIndex, match.index);
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
      const firstBranch: { body: ASTNode[]; condition: string } = { body: [], condition };
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
        const branch: { body: ASTNode[]; condition: string } = { body: [], condition };
        top.branches.push(branch);
        top.body = branch.body;
      }
    } else if (tagContent === 'else') {
      const top = stack[stack.length - 1];
      if (top && top.kind === 'if' && top.branches) {
        const branch: { body: ASTNode[] } = { body: [] };
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

  if (lastIndex < templateStr.length) {
    stack[stack.length - 1].body.push({
      type: 'text',
      value: templateStr.slice(lastIndex),
    });
  }

  return rootFrame.body;
}

function evaluateNodes(
  nodes: ASTNode[],
  context: TemplateContext,
  currentItem?: unknown
): string {
  let output = '';

  for (const node of nodes) {
    if (node.type === 'text') {
      output += node.value;
    } else if (node.type === 'var') {
      const val = resolveValue(node.path, context, currentItem);
      if (val !== undefined && val !== null) {
        output += String(val);
      }
    } else if (node.type === 'index') {
      const list = getNestedValue(context, node.path);
      if (Array.isArray(list) && list[node.index] !== undefined) {
        output += String(list[node.index]);
      }
    } else if (node.type === 'range') {
      const list = getNestedValue(context, node.path);
      if (Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          output += evaluateNodes(node.body, context, item);
        }
      }
    } else if (node.type === 'if') {
      for (const branch of node.branches) {
        if (!branch.condition || evaluateCondition(branch.condition, context, currentItem)) {
          output += evaluateNodes(branch.body, context, currentItem);
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
export function renderTemplate(templateStr: string, context: TemplateContext): string {
  if (!templateStr || typeof templateStr !== 'string') {
    return '';
  }

  const ast = parseTemplate(templateStr);
  return evaluateNodes(ast, context);
}
