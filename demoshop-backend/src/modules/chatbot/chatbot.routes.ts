import express from 'express';
import { createAbuseRateLimit } from '../../middleware/abuse-rate-limit.middleware';
import { getSuggestions, postMessage } from './chatbot.controller';

const router = express.Router();
const chatbotRateLimit = createAbuseRateLimit({
  name: 'public-chatbot', windowSeconds: 60, limits: { ip: 12, device: 10, account: 20 }, accountField: 'session_id', includeDevice: true, failOpen: true,
});

router.get('/suggestions', chatbotRateLimit, getSuggestions);
router.post('/message', chatbotRateLimit, postMessage);

export default router;
