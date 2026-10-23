// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Request, Response } from 'express';

import { ProviderRegistry } from '../../providers/registry.js';
import { isValidIndexerId } from '../../utils/indexer.js';
import { getInspectionCategories } from '../category-mappings.js';

export class CategoryController {
  /**
   * GET /api/v2.0/indexers/:indexer/categories
   */
  getCategories = (req: Request, res: Response): void => {
    const indexerParam =
      typeof req.params.indexer === 'string'
        ? req.params.indexer.toLowerCase()
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

    const categories = getInspectionCategories(provider.categoryMappings ?? []);
    res.json(categories);
  };

  constructor(private readonly registry: ProviderRegistry) {}
}
