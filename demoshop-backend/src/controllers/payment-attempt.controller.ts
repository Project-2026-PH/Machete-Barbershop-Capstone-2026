import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { paymentAttemptService } from '../services/payment-attempt.service';
import { PaymentAttemptStatus } from '../utils/cashier/payment-attempt-state.util';
import { AppError } from '../utils/error/AppError';
import multer from 'multer';
import { MAX_RECEIPT_BYTES, validateReceiptEvidence } from '../utils/cashier/receipt-evidence.util';

export const receiptEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError('Only JPEG and PNG receipt images are allowed.', 400));
  },
}).single('receipt');

export class PaymentAttemptController extends BaseController {
  async list(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const branchId = (req.user as any)?.branch_id;
      const openOnly = req.query.openOnly === 'true';
      const requestedStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
      const validStatuses: PaymentAttemptStatus[] = [
        'pending_verification', 'automated_review_passed', 'flagged', 'rejected', 'manually_confirmed',
      ];
      if (requestedStatus && !validStatuses.includes(requestedStatus as PaymentAttemptStatus)) {
        throw new AppError('Invalid payment attempt status.', 400);
      }
      const attempts = await paymentAttemptService.list(branchId, requestedStatus as PaymentAttemptStatus | undefined, openOnly);
      res.json(attempts);
    }, 'ListPaymentAttempts');
  }

  async receiptUrl(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const attemptId = Number.parseInt(req.params.attemptId as string, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) throw new AppError('Invalid payment attempt ID.', 400);
      res.json(await paymentAttemptService.getReceiptUrl(attemptId, (req.user as any)?.branch_id));
    }, 'GetPaymentAttemptReceiptUrl');
  }

  async uploadEvidence(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const attemptId = Number.parseInt(req.params.attemptId as string, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) throw new AppError('Invalid payment attempt ID.', 400);
      if (!req.file) throw new AppError('A receipt image is required.', 400);
      const evidence = validateReceiptEvidence(req.file);
      const actorId = (req.user as any)?.user_id || (req.user as any)?.id || null;
      res.json(await paymentAttemptService.uploadReceiptEvidence({
        attemptId,
        branchId: (req.user as any)?.branch_id,
        actorId,
        receiptBuffer: req.file.buffer,
        receiptEvidence: evidence,
        gcashReference: typeof req.body?.gcashReference === 'string' ? req.body.gcashReference : undefined,
        req,
      }));
    }, 'UploadPaymentAttemptEvidence');
  }

  async reconcile(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const attemptId = Number.parseInt(req.params.attemptId as string, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) throw new AppError('Invalid payment attempt ID.', 400);
      const decision = req.body?.decision;
      if (decision !== 'confirm' && decision !== 'reject') throw new AppError('Decision must be confirm or reject.', 400);
      const actorId = (req.user as any)?.user_id || (req.user as any)?.id || null;
      const result = await paymentAttemptService.reconcile({
        attemptId,
        branchId: (req.user as any)?.branch_id,
        actorId,
        decision,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        req,
      });
      res.json(result);
    }, 'ReconcilePaymentAttempt');
  }
}

const controller = new PaymentAttemptController();
export const list = controller.list.bind(controller);
export const receiptUrl = controller.receiptUrl.bind(controller);
export const uploadEvidence = controller.uploadEvidence.bind(controller);
export const reconcile = controller.reconcile.bind(controller);
export default controller;
