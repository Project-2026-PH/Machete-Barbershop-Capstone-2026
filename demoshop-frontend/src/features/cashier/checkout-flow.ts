// Keep the same key after a timeout: the server may already have committed.
export function createRetryableMutation<Payload, Result>(
  send: (payload: Payload, idempotencyKey: string) => Promise<Result>,
  newKey: () => string,
) {
  let lastFingerprint: string | null = null;
  let key: string | null = null;
  let inFlight: Promise<Result> | null = null;
  return {
    get pending() { return inFlight !== null; },
    get idempotencyKey() { return key; },
    commitLocally() {
      key = null;
      lastFingerprint = null;
    },
    run(payload: Payload): Promise<Result> {
      const fingerprint = JSON.stringify(payload);
      if (inFlight) {
        return fingerprint === lastFingerprint
          ? inFlight
          : Promise.reject(new Error('Wait for the current submission to finish.'));
      }
      if (fingerprint !== lastFingerprint || !key) key = newKey();
      lastFingerprint = fingerprint;
      const requestKey = key;
      inFlight = Promise.resolve().then(() => send(payload, requestKey))
        .then(result => {
          key = null;
          lastFingerprint = null;
          return result;
        }).finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

export async function completeForPayment(options: {
  id: string;
  inFlight: Set<string>;
  pending: () => () => void;
  complete: () => Promise<unknown>;
  ready: () => void | Promise<void>;
  failed: (error: unknown) => void;
}): Promise<void> {
  if (options.inFlight.has(options.id)) return;
  options.inFlight.add(options.id);
  try {
    // Open the pending payment UI in this event, before any network wait.
    const rollback = options.pending();
    try {
      await options.complete();
    } catch (error: any) {
      const message = error.response?.data?.error || error.response?.data?.message || '';
      // A retry after a lost response can find the service already completed.
      if (error.response?.status !== 409 || !/status 'completed'/i.test(message)) {
        rollback();
        options.failed(error);
        return;
      }
    }
    await options.ready();
  } finally {
    options.inFlight.delete(options.id);
  }
}
