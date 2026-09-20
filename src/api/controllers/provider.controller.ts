// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Request, Response } from 'express';

import { ProviderRegistry } from '../../providers/registry.js';
import { ProviderStatusMap } from '../../types/api.js';
import { JackettIndexer } from '../../types/jackett.js';

export class ProviderController {
  constructor(private readonly registry: ProviderRegistry) {}

  /**
   * GET /api/v2.0/indexers
   */
  list = (_req: Request, res: Response): void => {
    const infos = this.registry.getProviderInfos();
    const indexers: JackettIndexer[] = infos.map(info => ({
      caps: info.caps || {},
      configured: true,
      id: info.id || info.name.toLowerCase(),
      links: info.urls,
      name: info.name,
      site_link: info.urls[0] || '',
      type: info.type ?? 'public',
    }));
    res.json(indexers);
  };

  /**
   * GET /api/v2.0/indexers/check or /api/v2.0/indexers/status
   */
  check = async (_req: Request, res: Response): Promise<void> => {
    const checks = await this.registry.checkAllAvailability();
    const statusMap: ProviderStatusMap = {};

    for (const check of checks) {
      statusMap[check.name] = check.isAvailable;
    }

    res.json([statusMap]);
  };
}
