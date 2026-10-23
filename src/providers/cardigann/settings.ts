// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CardigannSetting } from './types.js';

/**
 * Settings holding tracker account credentials, which come from the session manager's own
 * `_USERNAME`, `_PASSWORD` and `_COOKIE` variables rather than from search configuration.
 */
const CREDENTIAL_SETTINGS = new Set(['cookie', 'password', 'username']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const TRUE_VALUES = new Set(['1', 'on', 'true', 'yes']);

/**
 * Configured value of a definition setting, as templates see it under `.Config`.
 */
export type SettingValue = boolean | number | string;

/**
 * Returns the environment variable that configures a definition setting, such as
 * `TORRGATE_RUTOR_SORT` for the `sort` setting of a tracker whose prefix is `TORRGATE_RUTOR`.
 */
export function getSettingVariableName(envVarPrefix: string, settingName: string): string {
  return `${envVarPrefix}_${settingName.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}`;
}

/**
 * Resolves the `.Config` values of a definition's settings: each setting's environment
 * variable when set and valid for its type, otherwise its declared default.
 *
 * Checkbox settings accept `true`/`false`, `1`/`0`, `yes`/`no` and `on`/`off`; select
 * settings accept one of their option keys. Invalid values are reported through `warn`
 * and fall back to the default. Informational settings and account credentials are skipped.
 */
export function resolveSettings(
  settings: CardigannSetting[] | undefined,
  envVarPrefix: string,
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = message => console.warn(message)
): Record<string, SettingValue> {
  const config: Record<string, SettingValue> = {};
  for (const setting of settings ?? []) {
    if (!setting.name || setting.type?.startsWith('info') || CREDENTIAL_SETTINGS.has(setting.name)) {
      continue;
    }

    const variableName = getSettingVariableName(envVarPrefix, setting.name);
    const raw = env[variableName]?.trim();
    const configured = raw ? parseSettingValue(setting, raw) : undefined;
    if (raw && configured === undefined) {
      warn(`[TorrGate] Ignoring invalid ${variableName} value '${raw}'; using the definition default`);
    }

    const value = configured ?? setting.default;
    if (value !== undefined) {
      config[setting.name] = value;
    }
  }
  return config;
}

function parseSettingValue(setting: CardigannSetting, raw: string): SettingValue | undefined {
  if (setting.type === 'checkbox') {
    const normalized = raw.toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return undefined;
  }
  if (setting.type === 'select' && setting.options) {
    return Object.hasOwn(setting.options, raw) ? raw : undefined;
  }
  return raw;
}
