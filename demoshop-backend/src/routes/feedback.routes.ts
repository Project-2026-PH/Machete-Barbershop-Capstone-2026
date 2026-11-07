import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import * as feedbackController from '../controllers/feedback.controller';

const router = express.Router();

// All feedback routes require JWT authentication
router.use(requireSupabaseAuth);

router.post('/rate', feedbackController.submitRating);

export default router;
