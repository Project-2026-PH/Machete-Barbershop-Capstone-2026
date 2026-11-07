import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { feedbackService } from '../services/feedback.service';

/**
 * Controller for Feedback/Rating operations.
 * Extends BaseController for standardized error handling.
 */
export class FeedbackController extends BaseController {
  async submitRating(req: Request, res: Response): Promise<void> {
    await this.handleRequest(res, async () => {
      const userId = (req.user as any)?.user_id || (req.user as any)?.id;
      const result = await feedbackService.submitRating(req.body, userId);
      res.status(201).json(result);
    }, 'SubmitRating');
  }
}

const controller = new FeedbackController();

export const submitRating = controller.submitRating.bind(controller);

export default controller;
