// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import iconv from 'iconv-lite';

import { ProxyConfig } from '../types/config.js';
import { ConcurrencyLimiter } from '../utils/limiter.js';

const DEFAULT_USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Largest upstream response body accepted, so a misbehaving mirror cannot make the
 * server buffer an unbounded amount of data.
 */
export const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/**
 * Redirects followed after a form POST before giving up.
 */
const MAX_REDIRECT_HOPS = 5;

/**
 * Builds a Cookie header from an existing header plus `Set-Cookie` values, later values
 * replacing earlier ones and empty values removing the cookie.
 */
export function mergeCookieHeader(existingHeader: string | undefined, setCookieHeaders: string[]): string {
  const jar = new Map<string, string>();
  const add = (pair: string): void => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) {
      return;
    }
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (value === '') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  };

  for (const pair of (existingHeader ?? '').split(';')) {
    add(pair);
  }
  for (const header of setCookieHeaders) {
    add(header.split(';')[0]);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * Encodes a string into windows-1251 percent-encoded bytes.
 */
export function encodeWin1251QueryParam(str: string, spaceAsPlus: boolean = true): string {
  const buf = iconv.encode(str, 'win1251');
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f ||
      byte === 0x7e
    ) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x20 && spaceAsPlus) {
      out += '+';
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/**
 * Binary HTTP response body with its headers.
 */
export interface BinaryResponse {
  data: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Decoded HTTP response containing text content, extracted cookies, and metadata.
 */
export interface DecodedResponse {
  content: string;
  cookies: string[];
  headers: Record<string, string | string[] | undefined>;
  status: number;
}

/**
 * HTTP client managing proxy configuration, timeouts, and charset decoding.
 */
export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly limiter = new ConcurrencyLimiter(10);

  constructor(proxyConfig?: ProxyConfig, timeoutMs: number = 10000) {
    const config: AxiosRequestConfig = {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      maxBodyLength: MAX_RESPONSE_BYTES,
      maxContentLength: MAX_RESPONSE_BYTES,
      timeout: timeoutMs,
    };

    if (proxyConfig) {
      const auth =
        proxyConfig.username && proxyConfig.password
          ? `${encodeURIComponent(proxyConfig.username)}:${encodeURIComponent(proxyConfig.password)}@`
          : '';
      const proxyUrl = proxyConfig.url || `http://${auth}${proxyConfig.host}:${proxyConfig.port}`;
      // HTTPS targets are tunnelled with CONNECT; plain-HTTP targets are sent to the proxy
      // as absolute-URI requests, since many proxies only allow CONNECT to port 443.
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.httpAgent = new HttpProxyAgent(proxyUrl);
      config.proxy = false;
    }

    this.client = axios.create(config);
  }

  /**
   * Performs a standard GET request returning JSON or plain text.
   */
  async get<T = unknown>(url: string, options: AxiosRequestConfig = {}): Promise<T> {
    return this.limiter.execute(async () => {
      const response = await this.client.get<T>(url, options);
      return response.data;
    });
  }

  /**
   * Fetches raw binary content from a URL as a Buffer.
   */
  async getBuffer(url: string, options: AxiosRequestConfig = {}): Promise<Buffer> {
    const { data } = await this.getBinary(url, options);
    return data;
  }

  /**
   * Fetches raw binary content together with the response headers.
   */
  async getBinary(url: string, options: AxiosRequestConfig = {}): Promise<BinaryResponse> {
    return this.limiter.execute(async () => {
      const response = await this.client.request<ArrayBuffer>({
        ...options,
        responseType: 'arraybuffer',
        url,
      });
      return {
        data: Buffer.from(response.data),
        headers: response.headers as Record<string, string | string[] | undefined>,
      };
    });
  }

  /**
   * Fetches a URL and decodes the binary response using the specified charset (e.g. windows-1251 or utf-8).
   */
  async getDecoded(
    url: string,
    encoding: 'utf-8' | 'windows-1251' = 'utf-8',
    options: AxiosRequestConfig = {}
  ): Promise<string> {
    const { content } = await this.requestDecoded(url, { ...options, method: 'GET' }, encoding);
    return content;
  }

  /**
   * Posts form data transcoded to the target encoding and returns the decoded response and cookies.
   */
  async postForm(
    url: string,
    formData: Record<string, string>,
    encoding: 'utf-8' | 'windows-1251' = 'utf-8',
    options: AxiosRequestConfig = {}
  ): Promise<DecodedResponse> {
    let data: string;

    if (encoding === 'windows-1251') {
      const parts: string[] = [];
      for (const [key, val] of Object.entries(formData)) {
        parts.push(`${encodeWin1251QueryParam(key)}=${encodeWin1251QueryParam(val)}`);
      }
      data = parts.join('&');
    } else {
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(formData)) {
        params.append(key, val);
      }
      data = params.toString();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.headers as Record<string, string>),
    };

    const response = await this.requestDecoded(
      url,
      {
        ...options,
        data,
        headers,
        maxRedirects: 0,
        method: 'POST',
      },
      encoding
    );
    return this.followRedirectsKeepingCookies(url, response, encoding, options);
  }

  /**
   * Follows 3xx responses one hop at a time so cookies set on every hop are kept.
   *
   * Trackers commonly answer a login POST with a redirect that carries the session cookie;
   * automatic redirect handling would only expose the final page's cookies. Cookies are sent
   * on to later hops only while they stay on the original host.
   */
  private async followRedirectsKeepingCookies(
    startUrl: string,
    firstResponse: DecodedResponse,
    encoding: 'utf-8' | 'windows-1251',
    options: AxiosRequestConfig
  ): Promise<DecodedResponse> {
    const startHost = new URL(startUrl).hostname;
    const { 'Content-Type': _contentType, Cookie: initialCookie, ...passThroughHeaders } =
      (options.headers as Record<string, string> | undefined) ?? {};
    const collectedCookies = [...firstResponse.cookies];
    let response = firstResponse;
    let currentUrl = startUrl;

    for (let hop = 0; hop < MAX_REDIRECT_HOPS && response.status >= 300 && response.status < 400; hop++) {
      const location = response.headers.location;
      const target = Array.isArray(location) ? location[0] : location;
      if (!target) {
        break;
      }

      const nextUrl = new URL(target, currentUrl);
      const hopHeaders: Record<string, string> = { ...passThroughHeaders };
      if (nextUrl.hostname === startHost) {
        const cookieHeader = mergeCookieHeader(initialCookie, collectedCookies);
        if (cookieHeader) {
          hopHeaders.Cookie = cookieHeader;
        }
      }

      response = await this.requestDecoded(
        nextUrl.toString(),
        { headers: hopHeaders, maxRedirects: 0, method: 'GET', signal: options.signal },
        encoding
      );
      collectedCookies.push(...response.cookies);
      currentUrl = nextUrl.toString();
    }

    return { ...response, cookies: collectedCookies };
  }

  /**
   * Executes an HTTP request and decodes the binary response buffer into a UTF-8 string.
   */
  async requestDecoded(
    url: string,
    options: AxiosRequestConfig = {},
    encoding: 'utf-8' | 'windows-1251' = 'utf-8'
  ): Promise<DecodedResponse> {
    return this.limiter.execute(async () => {
      const response = await this.client.request<ArrayBuffer>({
        ...options,
        responseType: 'arraybuffer',
        url,
        validateStatus: options.validateStatus ?? (status => status >= 200 && status < 400),
      });

      const buffer = Buffer.from(response.data || '');
      const content =
        encoding === 'windows-1251' ? iconv.decode(buffer, 'win1251') : iconv.decode(buffer, 'utf-8');

      const rawCookies = response.headers['set-cookie'];
      const cookies: string[] = Array.isArray(rawCookies)
        ? rawCookies
        : typeof rawCookies === 'string'
          ? [rawCookies]
          : [];

      return {
        content,
        cookies,
        headers: response.headers as Record<string, string | string[] | undefined>,
        status: response.status,
      };
    });
  }
}
