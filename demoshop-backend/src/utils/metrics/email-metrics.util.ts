export interface EmailMetricsSnapshot {
  attempted: number;
  sent: number;
  failed: number;
}

const counters: EmailMetricsSnapshot = {
  attempted: 0,
  sent: 0,
  failed: 0,
};

export const recordEmailDelivery = (sent: boolean): void => {
  counters.attempted += 1;
  if (sent) counters.sent += 1;
  else counters.failed += 1;
};

export const peekEmailMetrics = (): EmailMetricsSnapshot => ({ ...counters });
