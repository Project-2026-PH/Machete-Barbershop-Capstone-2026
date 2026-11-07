import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { transactionService } from '../services/transaction.service';
import type { TransactionFilterDTO } from '@demoshop/shared-types';

export class TransactionController extends BaseController {
  async getReceiptUrl(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const transactionId = Number.parseInt(String(req.params.id), 10);
      const result = await transactionService.getReceiptUrl(transactionId, req.user);
      res.json(result);
    }, 'GetTransactionReceiptUrl');
  }

  async getTransactions(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      res,
      async () => {
        const query = req.query;

        const filters: TransactionFilterDTO = {
          search: typeof query.search === 'string' ? query.search : undefined,
          channel: typeof query.channel === 'string' ? (query.channel as any) : undefined,
          startDate: typeof query.startDate === 'string' ? query.startDate : undefined,
          endDate: typeof query.endDate === 'string' ? query.endDate : undefined,
          paymentMethod: typeof query.paymentMethod === 'string' ? query.paymentMethod : undefined,
          barberId: typeof query.barberId === 'string' ? query.barberId : undefined,
          status: typeof query.status === 'string' ? (query.status as any) : undefined,
          category: typeof query.category === 'string' ? (query.category as any) : undefined,
          minAmount: query.minAmount !== undefined && query.minAmount !== '' ? Number(query.minAmount) : undefined,
          maxAmount: query.maxAmount !== undefined && query.maxAmount !== '' ? Number(query.maxAmount) : undefined,
          page: query.page ? Number(query.page) : 1,
          limit: query.limit ? Number(query.limit) : 25,
          cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
          sortBy: typeof query.sortBy === 'string' ? query.sortBy : 'date_desc',
          branchId: query.branchId ? Number(query.branchId) : undefined,
        };

        const result = await transactionService.getTransactionHistory(filters, req.user);
        res.json(result);
      },
      'GetTransactions'
    );
  }
}

export const transactionController = new TransactionController();
export const getTransactions = transactionController.getTransactions.bind(transactionController);
export const getTransactionReceiptUrl = transactionController.getReceiptUrl.bind(transactionController);
