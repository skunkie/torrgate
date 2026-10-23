// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { BinaryResponse, HttpClient } from '../../http/http-client.js';
import { RequestThrottle } from '../../http/request-throttle.js';
import { TorrentDownload } from '../../types/provider.js';
import { isTorrentFile } from '../../utils/bencode.js';
import { parseContentDispositionFileName, sanitizeTorrentFileName } from '../../utils/content-disposition.js';
import { findMatchingMirror } from '../../utils/mirror.js';
import { SessionManager } from './session-manager.js';
import { CardigannDefinition } from './types.js';

interface DownloadContext {
  definition: CardigannDefinition;
  ensureSession: (baseUrl: string) => Promise<void>;
  httpClient: HttpClient;
  renewSession: (baseUrl: string) => Promise<boolean>;
  requestThrottle?: RequestThrottle;
  sessionManager: SessionManager;
  urls: string[];
}

/**
 * Fetches a .torrent file with the tracker session, logging in again once if the
 * tracker answers with a login or error page instead of the file.
 */
export async function downloadTorrent(url: string, { definition, ensureSession, httpClient, renewSession, requestThrottle, sessionManager, urls }: DownloadContext): Promise<TorrentDownload> {
  const baseUrl = findMatchingMirror(url, urls);
  if (!baseUrl) throw new Error('Target download host is not allowed for this indexer');
  const fetchFile = async (): Promise<BinaryResponse> => {
    const headers: Record<string, string> = {};
    if (definition.login) {
      await ensureSession(baseUrl);
    }
    const cookieHeader = sessionManager.getCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    return httpClient.getBinary(url, {
      beforeRedirect: (_options, responseDetails, requestDetails) => {
        const target = new URL(responseDetails.headers.location, requestDetails.url);
        if (
          (target.protocol !== 'http:' && target.protocol !== 'https:') ||
          !findMatchingMirror(target.href, urls)
        ) {
          throw new Error('Target download host is not allowed for this indexer');
        }
      },
      headers,
      requestThrottle,
    });
  };

  let response = await fetchFile();
  if (!isTorrentFile(response.data) && (await renewSession(baseUrl))) {
    response = await fetchFile();
  }
  if (!isTorrentFile(response.data)) {
    throw new Error('Upstream tracker returned non-torrent response (login or error page)');
  }
  sessionManager.confirmSession();

  return {
    data: response.data,
    fileName: sanitizeTorrentFileName(parseContentDispositionFileName(response.headers['content-disposition'])),
  };
}
