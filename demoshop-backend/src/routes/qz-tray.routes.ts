import express from 'express';
import { getCertificate, sign } from '../controllers/qz-tray.controller';
import { requireSupabaseAuth } from '../middleware/auth.middleware';

const router = express.Router();

router.use(requireSupabaseAuth);
router.get('/certificate', getCertificate);
router.post('/sign', sign);

export default router;
