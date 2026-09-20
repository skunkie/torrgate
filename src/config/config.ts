// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { ProxyConfig, ServerConfig } from '../types/config.js';

dotenv.config();

/**
 * Parses an HTTP/HTTPS proxy URL into structured configuration. A URL without a scheme is
 * treated as `http://`. Other schemes (such as `socks5://`) are not supported by the proxy
 * agents and return `undefined`.
 */
export function parseProxyUrl(rawUrl: string): ProxyConfig | undefined {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return undefined;
    }

    const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const parsed = new URL(hasProtocol ? trimmed : `http://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'https:'
        ? 443
        : 80;

    return {
      host: parsed.hostname,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      port,
      url: parsed.href,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Parses a `TRUST_PROXY` value into an Express `trust proxy` setting: `true`/`false`,
 * a hop count, or an address/subnet list such as `loopback, 10.0.0.0/8`.
 * On Vercel, where the platform overwrites `X-Forwarded-For` with the real client
 * address, all proxies are trusted when nothing is configured.
 */
export function parseTrustProxy(
  rawValue: string | undefined,
  isVercel: boolean = Boolean(process.env.VERCEL)
): boolean | number | string | undefined {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return isVercel ? true : undefined;
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/**
 * Returns the names of set environment variables that configure a tracker account
 * (username, password or session cookie), sorted.
 */
export function findTrackerAccountVariables(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env)
    .filter(name => Boolean(env[name]))
    .filter(
      name =>
        /^TORRGATE_.+_(?:COOKIE|PASSWORD|USERNAME)$/.test(name) ||
        name === 'TRACKER_PASSWORD' ||
        name === 'TRACKER_USERNAME'
    )
    .sort();
}

/**
 * Returns a warning when tracker accounts are configured but no API key protects them,
 * since anyone who can reach the server could then search and download through them.
 */
export function getUnprotectedAccountWarning(
  config: Pick<ServerConfig, 'apiKey'>,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (config.apiKey) {
    return undefined;
  }
  const accountVariables = findTrackerAccountVariables(env);
  if (accountVariables.length === 0) {
    return undefined;
  }
  return (
    `[TorrGate] API_KEY is not set, but tracker accounts are configured (${accountVariables.join(', ')}). ` +
    'Anyone who can reach this server can search and download through those accounts. Set API_KEY to require a key.'
  );
}

/**
 * Loads server configuration from CLI flags and environment variables.
 */
export function loadConfig(): ServerConfig {
  const argv = yargs(hideBin(process.argv))
    .option('apiKey', {
      default: process.env.API_KEY,
      description: 'API key for protecting Jackett indexer endpoints',
      type: 'string',
    })
    .option('cacheTtl', {
      default: process.env.CACHE_TTL_SECONDS !== undefined ? Number(process.env.CACHE_TTL_SECONDS) : 300,
      description: 'Search and RSS cache TTL in seconds (0 to disable)',
      type: 'number',
    })
    .option('host', {
      default: process.env.HOST || '0.0.0.0',
      description: 'Host address to bind',
      type: 'string',
    })
    .option('port', {
      alias: 'p',
      default: Number(process.env.PORT) || 8443,
      description: 'Server port',
      type: 'number',
    })
    .option('proxy', {
      alias: 'x',
      default:
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy,
      description: 'Outbound HTTP/HTTPS proxy URL',
      type: 'string',
    })
    .option('timeout', {
      default: Number(process.env.REQUEST_TIMEOUT_MS) || 10000,
      description: 'Upstream request timeout in milliseconds',
      type: 'number',
    })
    .parseSync();

  const kvRestApiToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || undefined;
  const kvRestApiUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || undefined;

  const config: ServerConfig = {
    apiKey: argv.apiKey || process.env.API_KEY || undefined,
    cacheTtlSeconds: Number.isFinite(argv.cacheTtl) ? Number(argv.cacheTtl) : 300,
    host: argv.host,
    kvRestApiToken,
    kvRestApiUrl,
    port: argv.port,
    requestTimeoutMs: argv.timeout,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  };

  if (argv.proxy) {
    config.proxy = parseProxyUrl(argv.proxy);
    if (!config.proxy) {
      console.warn('[TorrGate] Ignoring outbound proxy: only http:// and https:// proxy URLs are supported');
    }
  }

  return config;
}
