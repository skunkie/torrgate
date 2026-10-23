// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { WEB_CLIENT_SCRIPT } from './client/web-client-script.js';
import { WEB_CLIENT_STYLES } from './client/web-client-styles.js';
import { LOGIN_PAGE_STYLES } from './login-styles.js';
import { CLIENT_PLUGINS_SCRIPT } from './plugins/client-plugins-script.js';
import { PLUGIN_SETTINGS_SCRIPT } from './plugins/plugin-settings-script.js';
import { QBITTORRENT_PLUGIN_SCRIPT } from './plugins/qbittorrent-plugin-script.js';
import { TORRPLAY_PLUGIN_SCRIPT } from './plugins/torrplay-plugin-script.js';
import { FORM_STYLES } from './shared/form-styles.js';
import { THEME_STYLES } from './shared/theme-styles.js';

export const LOGIN_STYLES = `${THEME_STYLES}${FORM_STYLES}${LOGIN_PAGE_STYLES}`;
export const WEB_SCRIPT = `${CLIENT_PLUGINS_SCRIPT}${TORRPLAY_PLUGIN_SCRIPT}${QBITTORRENT_PLUGIN_SCRIPT}${PLUGIN_SETTINGS_SCRIPT}${WEB_CLIENT_SCRIPT}`;
export const WEB_STYLES = `${THEME_STYLES}${FORM_STYLES}${WEB_CLIENT_STYLES}`;
