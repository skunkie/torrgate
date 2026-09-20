// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Forward proxy configuration for outbound scraper requests.
 */
export interface ProxyConfig {
  host: string;
  password?: string;
  port: number;
  url: string;
  username?: string;
}

/**
 * Global TorrGate application configuration.
 */
export interface ServerConfig {
  apiKey?: string;
  cacheTtlSeconds: number;
  host: string;
  kvRestApiToken?: string;
  kvRestApiUrl?: string;
  port: number;
  proxy?: ProxyConfig;
  requestTimeoutMs: number;
  /** Express `trust proxy` value; unset means the socket address is the client address. */
  trustProxy?: boolean | number | string;
}
