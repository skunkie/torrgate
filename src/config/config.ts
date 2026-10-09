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
 * Parses a `TORRGATE_TRUST_PROXY` value into an Express `trust proxy` setting: `true`/`false`,
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
    .filter(name => /^TORRGATE_.+_(?:COOKIE|PASSWORD|USERNAME)$/.test(name))
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
    `[TorrGate] TORRGATE_API_KEY is not set, but tracker accounts are configured (${accountVariables.join(', ')}). ` +
    'Anyone who can reach this server can search and download through those accounts. Set TORRGATE_API_KEY to require a key.'
  );
}

/**
 * Parses a CORS setting as `*` or a normalized HTTP(S) origin, rejecting credentials
 * and non-origin URL components. Empty settings return `undefined`.
 */
export function parseCorsOrigin(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw === '*') return raw;
  try {
    const url = new URL(raw);
    if ((url.protocol === 'http:' || url.protocol === 'https:')
      && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password) {
      return url.origin;
    }
  } catch {}
  throw new Error('TORRGATE_CORS_ORIGIN must be * or a single HTTP(S) origin');
}

/**
 * Loads server configuration from CLI flags and environment variables.
 */
export function loadConfig(): ServerConfig {
  const argv = yargs(hideBin(process.argv))
    .option('apiKey', {
      default: process.env.TORRGATE_API_KEY,
      description: 'API key for protecting Jackett indexer endpoints',
      type: 'string',
    })
    .option('cacheTtl', {
      default: process.env.TORRGATE_CACHE_TTL_SECONDS !== undefined ? Number(process.env.TORRGATE_CACHE_TTL_SECONDS) : 300,
      description: 'Search and RSS cache TTL in seconds (0 to disable)',
      type: 'number',
    })
    .option('corsOrigin', {
      default: process.env.TORRGATE_CORS_ORIGIN,
      description: 'Allowed browser origin for CORS (* for all origins)',
      type: 'string',
    })
    .option('host', {
      default: process.env.TORRGATE_HOST || '0.0.0.0',
      description: 'Host address to bind',
      type: 'string',
    })
    .option('maxConcurrentRequests', {
      default: process.env.TORRGATE_MAX_CONCURRENT_REQUESTS !== undefined ? Number(process.env.TORRGATE_MAX_CONCURRENT_REQUESTS) : 10,
      description: 'Maximum concurrent upstream requests across all trackers',
      type: 'number',
    })
    .option('port', {
      alias: 'p',
      default: Number(process.env.TORRGATE_PORT ?? process.env.PORT) || 8443,
      description: 'Server port',
      type: 'number',
    })
    .option('proxy', {
      alias: 'x',
      default:
        process.env.TORRGATE_PROXY ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy,
      description: 'Outbound HTTP/HTTPS proxy URL',
      type: 'string',
    })
    .option('timeout', {
      default: Number(process.env.TORRGATE_REQUEST_TIMEOUT_MS) || 10000,
      description: 'Upstream request timeout in milliseconds',
      type: 'number',
    })
    .parseSync();

  if (!Number.isSafeInteger(argv.maxConcurrentRequests) || argv.maxConcurrentRequests < 1) {
    throw new Error('TORRGATE_MAX_CONCURRENT_REQUESTS must be a positive safe integer');
  }

  const kvRestApiToken = process.env.TORRGATE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || undefined;
  const kvRestApiUrl = process.env.TORRGATE_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || undefined;

  const config: ServerConfig = {
    apiKey: argv.apiKey || process.env.TORRGATE_API_KEY || undefined,
    cacheTtlSeconds: Number.isFinite(argv.cacheTtl) ? Number(argv.cacheTtl) : 300,
    corsOrigin: parseCorsOrigin(argv.corsOrigin),
    host: argv.host,
    kvRestApiToken,
    kvRestApiUrl,
    maxConcurrentRequests: argv.maxConcurrentRequests,
    port: argv.port,
    requestTimeoutMs: argv.timeout,
    trustProxy: parseTrustProxy(process.env.TORRGATE_TRUST_PROXY),
  };

  if (argv.proxy) {
    config.proxy = parseProxyUrl(argv.proxy);
    if (!config.proxy) {
      console.warn('[TorrGate] Ignoring outbound proxy: only http:// and https:// proxy URLs are supported');
    }
  }

  return config;
}
