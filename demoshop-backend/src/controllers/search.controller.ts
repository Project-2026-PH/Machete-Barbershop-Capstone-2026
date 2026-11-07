import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { searchService, SearchService } from '../services/search.service';

export class SearchController extends BaseController {
  constructor(private service: SearchService = searchService) {
    super();
  }

  search = async (req: Request, res: Response): Promise<void> => {
    await this.handleRequest(res, async () => {
      const q = (req.query.q as string) || (req.query.query as string) || '';
      const limit = parseInt(req.query.limit as string, 10) || 6;
      const scopeParam = (req.query.scope as 'shop' | 'system' | 'all') || undefined;
      const scope = scopeParam || (req.baseUrl?.includes('system-admin') ? 'system' : 'shop');

      const result = (scopeParam || req.baseUrl?.includes('system-admin'))
        ? await this.service.globalSearch(q, limit, scope)
        : await this.service.globalSearch(q, limit);

      res.status(200).json(result);
    }, 'GlobalSearch');
  };
}

export const searchController = new SearchController();
