import type { Request, Response } from 'express';
import { ChatbotRequestSchema } from './chatbot.schemas';
import { chatbotService } from './chatbot.service';
import { chatbotTelemetry } from './chatbot.telemetry';

export const getSuggestions = (_req: Request, res: Response) => res.json({ suggestions: chatbotService.suggestions() });

export const postMessage = async (req: Request, res: Response) => {
  const parsed = ChatbotRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    chatbotTelemetry.record('request', { outcome: 'invalid_request' });
    res.status(400).json({ error: 'INVALID_CHATBOT_REQUEST', message: 'Please check your message and try again.' });
    return;
  }
  const startedAt = Date.now();
  try {
    if (parsed.data.suggestion_id && chatbotService.suggestions().some((item) => item.id === parsed.data.suggestion_id)) {
      chatbotTelemetry.record('suggestion_selected', { suggestion: parsed.data.suggestion_id });
    }
    const response = await chatbotService.message(parsed.data);
    chatbotTelemetry.record('request', {
      outcome: response.status,
      intent: response.intent.toLowerCase(),
      latency: Date.now() - startedAt < 1000 ? 'under_1s' : Date.now() - startedAt < 3000 ? '1s_3s' : 'over_3s',
    });
    res.json(response);
  } catch {
    chatbotTelemetry.record('request', { outcome: 'error' });
    res.status(200).json({
      status: 'error', intent: 'GENERAL_FAQ', message: 'I could not check that right now. Please try again.',
      data: { branch_id: null, availability_date: null, price_total: null, price_currency: null, branches: [], faqs: [], barbers: [], services: [], availability: [], location: null, visit_lookup: null },
      suggestions: chatbotService.suggestions().slice(0, 3), requires_clarification: false, clarification_field: null, generated_at: new Date().toISOString(),
    });
  }
};
