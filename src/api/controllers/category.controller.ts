// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Request, Response } from 'express';

import { getCategoriesForProvider } from '../../config/categories.js';
import { ProviderRegistry } from '../../providers/registry.js';
import { isValidIndexerId } from '../../utils/indexer.js';

export class CategoryController {
  constructor(private readonly registry: ProviderRegistry) {}

  /**
   * GET /api/v2.0/indexers/:indexer/categories
   */
  getCategories = (req: Request, res: Response): void => {
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
      return;
    }

    const provider = this.registry.getProvider(indexerParam);

    if (!provider) {
      res.status(404).json({
        error: 'NotFound',
        message: `Indexer '${indexerParam}' not found`,
        statusCode: 404,
        success: false,
      });
      return;
    }

    const categories = getCategoriesForProvider(provider);
    res.json(categories);
  };
}
