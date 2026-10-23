// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

const GO_FLAG_GROUP = /^\(\?([imsU]+)\)/;
const JS_FLAGS: Record<string, string> = { i: 'i', m: 'm', s: 's' };

/**
 * Compiles a Go (RE2) regular expression from a Cardigann definition into a JavaScript
 * `RegExp`. A leading `(?ims)` flag group becomes JavaScript flags, and `\p{IsScript}`
 * classes become `\p{Script=...}`. Returns `undefined` for patterns JavaScript cannot
 * express, such as the ungreedy `U` flag.
 */
export function compileGoRegExp(pattern: string, flags: string = ''): RegExp | undefined {
  let source = pattern;
  const flagSet = new Set(flags);
  const flagGroup = source.match(GO_FLAG_GROUP);
  if (flagGroup) {
    for (const flag of flagGroup[1]) {
      const jsFlag = JS_FLAGS[flag];
      if (!jsFlag) return undefined;
      flagSet.add(jsFlag);
    }
    source = source.slice(flagGroup[0].length);
  }
  if (source.includes('\\p{Is')) {
    source = source.replaceAll(/\\p\{Is([A-Za-z]+)\}/g, '\\p{Script=$1}');
  }
  if (source.includes('\\p{') || source.includes('\\P{')) {
    flagSet.add('u');
  }

  try {
    return new RegExp(source, [...flagSet].join(''));
  } catch {
    return undefined;
  }
}
