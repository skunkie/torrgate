// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import * as cheerio from 'cheerio';

import { renderTemplate } from './template.js';
import { CardigannLogin, TemplateContext } from './types.js';

/**
 * A login page that could not be submitted, with a message safe to show to clients.
 */
export class LoginFormError extends Error {
  override name = 'LoginFormError';
}

export function buildLoginForm(content: string, login: CardigannLogin, loginUrl: string, formData: Record<string, string>, context: TemplateContext) {
  const $ = cheerio.load(content);
  const formSelector = login.form || 'form';
  const form = $(formSelector).first();
  if (form.length === 0) {
    throw new LoginFormError(`login page has no form matching '${formSelector}'`);
  }

  const fields: Record<string, string> = {};
  form.find('input[name]').each((_, element) => {
    const input = $(element);
    const type = (input.attr('type') || '').toLowerCase();
    if ((type === 'checkbox' || type === 'radio') && input.attr('checked') === undefined) return;
    if (type === 'submit' || type === 'image' || type === 'button' || type === 'file') return;
    fields[input.attr('name')!] = input.attr('value') ?? '';
  });
  form.find('select[name]').each((_, element) => {
    const select = $(element);
    const option = select.find('option[selected]').first().length > 0
      ? select.find('option[selected]').first()
      : select.find('option').first();
    fields[select.attr('name')!] = option.attr('value') ?? option.text();
  });
  form.find('textarea[name]').each((_, element) => {
    fields[$(element).attr('name')!] = $(element).text();
  });
  Object.assign(fields, formData);

  const action = login.submitpath ? renderTemplate(login.submitpath, context) : form.attr('action') || '';
  const submitUrl = new URL(action || loginUrl, loginUrl).toString();
  return { fields, submitUrl };
}
