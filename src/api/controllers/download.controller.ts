// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Request, Response } from 'express';

import { ProviderRegistry } from '../../providers/registry.js';
import { MagnetResponse } from '../../types/api.js';
import { TorrentFile } from '../../types/provider.js';
import { parseTorrentMetainfo } from '../../utils/bencode.js';
import { buildAttachmentHeader } from '../../utils/content-disposition.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { buildMagnetUri } from '../../utils/magnet.js';
import { findMatchingMirror } from '../../utils/mirror.js';
import { getQueryString } from '../../utils/query.js';

/**
 * Controller handling authenticated .torrent file proxy downloads and magnet URI extraction.
 */
export class DownloadController {
  constructor(private readonly registry: ProviderRegistry) {}

  /**
   * GET /api/v2.0/indexers/:indexer/download
   */
  download = async (req: Request, res: Response): Promise<void> => {
    const torrentFile = await this.fetchTorrentFile(req, res);
    if (!torrentFile) {
      return;
    }

    res.setHeader('Content-Type', 'application/x-bittorrent');
    res.setHeader('Content-Disposition', buildAttachmentHeader(torrentFile.fileName));
    res.send(torrentFile.data);
  };

  /**
   * GET /api/v2.0/indexers/:indexer/magnet
   */
  magnet = async (req: Request, res: Response): Promise<void> => {
    const torrentFile = await this.fetchTorrentFile(req, res);
    if (!torrentFile) {
      return;
    }

    const metainfo = parseTorrentMetainfo(torrentFile.data);
    if (!metainfo) {
      res.status(502).json({
        error: 'BadGateway',
        message: 'Upstream .torrent file has no readable v1 info dictionary',
        statusCode: 502,
        success: false,
      });
      return;
    }

    const body: MagnetResponse = {
      InfoHash: metainfo.infoHash,
      MagnetUri: buildMagnetUri(metainfo.infoHash, metainfo.trackers, metainfo.name),
    };
    res.json(body);
  };

  /**
   * Validates the indexer and download URL of a request and fetches the .torrent file
   * through the provider. Sends the error response and returns null when any step fails.
   */
  private async fetchTorrentFile(req: Request, res: Response): Promise<TorrentFile | null> {
    const indexerParam =
      typeof req.params.indexer === 'string'
        ? req.params.indexer.toLowerCase()
        : typeof req.params.provider === 'string'
          ? req.params.provider.toLowerCase()
          : '';

    if (!isValidIndexerId(indexerParam)) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid indexer identifier format',
        statusCode: 400,
        success: false,
      });
      return null;
    }

    const provider = this.registry.getProvider(indexerParam);
    if (!provider) {
      res.status(404).json({
        error: 'NotFound',
        message: `Indexer '${indexerParam}' not found`,
        statusCode: 404,
        success: false,
      });
      return null;
    }

    let rawUrl = getQueryString(req.query, 'url', 'path') ?? '';
    if (!rawUrl) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Download url or path parameter is required',
        statusCode: 400,
        success: false,
      });
      return null;
    }

    if (
      !rawUrl.startsWith('http://') &&
      !rawUrl.startsWith('https://') &&
      !rawUrl.startsWith('/')
    ) {
      try {
        const decoded = Buffer.from(rawUrl, 'base64url').toString('utf8');
        if (
          decoded.startsWith('http://') ||
          decoded.startsWith('https://') ||
          decoded.startsWith('/')
        ) {
          rawUrl = decoded;
        }
      } catch {
        // Keep rawUrl as-is if decoding fails
      }
    }

    // Resolve relative download URL against provider's primary URL
    let targetUrl: string;
    try {
      const baseUrl = provider.urls[0] || 'https://example.org';
      targetUrl = new URL(rawUrl, baseUrl).toString();
    } catch {
      targetUrl = rawUrl;
    }

    // Validate that target host is an allowed provider mirror or download domain
    if (!findMatchingMirror(targetUrl, provider.urls)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Target download host is not allowed for this indexer',
        statusCode: 403,
        success: false,
      });
      return null;
    }

    try {
      return await provider.downloadTorrent(targetUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download .torrent file';
      res.status(502).json({
        error: 'BadGateway',
        message,
        statusCode: 502,
        success: false,
      });
      return null;
    }
  }
}
