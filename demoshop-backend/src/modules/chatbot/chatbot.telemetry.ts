import logger from '../../utils/general/logger';
import { incrementTelemetryCounter } from '../../redis';

const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const SAFE_METRIC = /^[a-z0-9_-]{1,64}$/;

/** Records only bounded labels and aggregate counters; never pass customer content here. */
export const chatbotTelemetry = {
  record(event: string, labels: Record<string, string> = {}) {
    if (!SAFE_METRIC.test(event)) return;
    const safeLabels = Object.fromEntries(Object.entries(labels)
      .filter(([key, value]) => SAFE_METRIC.test(key) && SAFE_METRIC.test(value))
      .slice(0, 6));
    const key = `telemetry:chatbot:${event}${Object.entries(safeLabels).map(([k, v]) => `:${k}-${v}`).join('')}`;
    void incrementTelemetryCounter(key, RETENTION_SECONDS);
    logger.info('chatbot_telemetry', { event, ...safeLabels });
  },
  usage(inputTokens: number, outputTokens: number) {
    const input = Number.isFinite(inputTokens) ? Math.max(0, Math.floor(inputTokens)) : 0;
    const output = Number.isFinite(outputTokens) ? Math.max(0, Math.floor(outputTokens)) : 0;
    const inputRate = Number(process.env.GEMINI_INPUT_USD_PER_MILLION);
    const outputRate = Number(process.env.GEMINI_OUTPUT_USD_PER_MILLION);
    const estimatedCostUsd = Number.isFinite(inputRate) && Number.isFinite(outputRate) && inputRate >= 0 && outputRate >= 0
      ? Number(((input * inputRate + output * outputRate) / 1_000_000).toFixed(8)) : null;
    logger.info('chatbot_telemetry', { event: 'gemini_usage', input_tokens: input, output_tokens: output, estimated_cost_usd: estimatedCostUsd });
    void incrementTelemetryCounter('telemetry:chatbot:gemini:request', RETENTION_SECONDS);
    if (input > 0) void incrementTelemetryCounter('telemetry:chatbot:gemini:input_tokens', RETENTION_SECONDS, input);
    if (output > 0) void incrementTelemetryCounter('telemetry:chatbot:gemini:output_tokens', RETENTION_SECONDS, output);
    if (estimatedCostUsd !== null) {
      void incrementTelemetryCounter('telemetry:chatbot:gemini:estimated_cost_micro_usd', RETENTION_SECONDS, Math.round(estimatedCostUsd * 1_000_000));
    }
  },
  async tool<T>(toolName: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      this.record('tool_execution', { tool: toolName, outcome: 'success', latency: latencyBucket(Date.now() - startedAt) });
      return result;
    } catch {
      this.record('tool_execution', { tool: toolName, outcome: 'failure' });
      throw new Error('CHATBOT_TOOL_FAILED');
    }
  },
};

const latencyBucket = (ms: number) => ms < 250 ? 'under_250ms' : ms < 1000 ? '250ms_1s' : ms < 3000 ? '1s_3s' : 'over_3s';
export const CHATBOT_TELEMETRY_RETENTION_DAYS = 90;
