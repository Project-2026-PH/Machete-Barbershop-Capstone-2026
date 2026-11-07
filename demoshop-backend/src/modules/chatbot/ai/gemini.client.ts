import { GoogleGenAI } from '@google/genai';
import { CHATBOT_SYSTEM_INSTRUCTION } from '../chatbot.instructions';
import type { ChatbotIntent } from '../types';
import logger from '../../../utils/general/logger';
import { chatbotTelemetry } from '../chatbot.telemetry';

const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { message: { type: 'STRING' } },
  required: ['message'],
  propertyOrdering: ['message'],
};

export const generateGroundedMessage = async (args: {
  intent: ChatbotIntent;
  query: string;
  previousMessages?: Array<{ role: 'customer' | 'assistant'; text: string }>;
  retrieved: unknown;
  fallback: string;
}): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return args.fallback;
  const client = new GoogleGenAI({ apiKey });
  const startedAt = Date.now();
  const contents = JSON.stringify({ intent: args.intent, previous_conversation: args.previousMessages || [], customer_query: args.query, public_records: args.retrieved });
  // An oversized database record must not turn a short customer message into
  // an oversized provider request. The deterministic response remains usable.
  if (contents.length > 16_000) {
    chatbotTelemetry.record('gemini', { outcome: 'input_too_large' });
    return args.fallback;
  }
  const response = await client.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: CHATBOT_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 240,
      temperature: 0.2,
    },
  });
  const usage = response.usageMetadata;
  chatbotTelemetry.usage(usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0);
  logger.info('[Chatbot] Gemini response generated', {
    event: 'chatbot_gemini_response',
    model: MODEL,
    intent: args.intent,
    input_tokens: usage?.promptTokenCount ?? null,
    output_tokens: usage?.candidatesTokenCount ?? null,
    duration_ms: Date.now() - startedAt,
  });
  const parsed = JSON.parse(response.text || '{}') as { message?: unknown };
  return typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim().slice(0, 1600) : args.fallback;
};
