/**
 * Hasura Realtime GraphQL-WS client.
 * Provides multiplexed WebSocket subscriptions to Hasura for live database change streams.
 */

export type HasuraRealtimeStatus = 'connecting' | 'live' | 'unavailable';
export type HasuraRealtimeStatusHandler = (status: HasuraRealtimeStatus, error?: unknown) => void;
export type HasuraRealtimeErrorHandler = (error: unknown) => void;

type SubscriptionCallback<T = any> = (data: T) => void;

interface ActiveSubscription {
  id: string;
  query: string;
  variables?: Record<string, unknown>;
  onData: SubscriptionCallback;
  onError?: HasuraRealtimeErrorHandler;
  onStatus?: HasuraRealtimeStatusHandler;
  resultTimer: ReturnType<typeof setTimeout> | null;
  status: HasuraRealtimeStatus | null;
}

export interface HasuraWebSocketClientOptions {
  url?: string;
  enabled?: boolean;
  socketFactory?: (url: string, protocol: string) => WebSocket;
  connectionTimeoutMs?: number;
  initialResultTimeoutMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

export class HasuraWebSocketClient {
  private readonly url: string;
  private readonly enabled: boolean;
  private readonly socketFactory: (url: string, protocol: string) => WebSocket;
  private readonly connectionTimeoutMs: number;
  private readonly initialResultTimeoutMs: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, ActiveSubscription>();
  private subCounter = 0;
  private isConnected = false;
  private isConnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionAckTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  constructor(options: HasuraWebSocketClientOptions = {}) {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
    this.url = options.url ?? (env.VITE_HASURA_WS_URL as string) ?? '';
    const envEnabled = env.VITE_ENABLE_HASURA_REALTIME;
    this.enabled = options.enabled ?? (envEnabled === true || envEnabled === 'true');
    this.socketFactory = options.socketFactory ?? ((url, protocol) => new WebSocket(url, protocol));
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 12_000;
    this.initialResultTimeoutMs = options.initialResultTimeoutMs ?? 12_000;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
  }

  public isEnabled(): boolean {
    return this.enabled && Boolean(this.url);
  }

  private setSubscriptionStatus(
    subscription: ActiveSubscription,
    status: HasuraRealtimeStatus,
    error?: unknown,
  ): void {
    if (subscription.status === status) return;
    subscription.status = status;
    try {
      subscription.onStatus?.(status, error);
    } catch (callbackError) {
      console.error('[HasuraRealtime] Status callback failed:', callbackError);
    }
  }

  private notifyAllSubscriptions(status: HasuraRealtimeStatus, error?: unknown): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.resultTimer !== null) {
        clearTimeout(subscription.resultTimer);
        subscription.resultTimer = null;
      }
      this.setSubscriptionStatus(subscription, status, error);
    }
  }

  private connect(): void {
    if (this.isConnected || this.isConnecting || this.subscriptions.size === 0) return;
    if (!this.isEnabled()) {
      this.notifyAllSubscriptions('unavailable', new Error('Hasura Realtime is not configured or enabled.'));
      return;
    }

    this.isConnecting = true;
    this.notifyAllSubscriptions('connecting');

    try {
      const socket = this.socketFactory(this.url, 'graphql-ws');
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.connectionAckTimer = setTimeout(() => {
          this.handleConnectionFailure(new Error('Hasura Realtime connection acknowledgement timed out.'));
        }, this.connectionTimeoutMs);
        if (!this.send({ type: 'connection_init' })) {
          this.handleConnectionFailure(new Error('Could not initialize the Hasura Realtime connection.'));
        }
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          this.handleMessage(JSON.parse(String(event.data)));
        } catch (error) {
          console.warn('[HasuraRealtime] Error parsing WebSocket message:', error);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.handleConnectionFailure(new Error('Hasura Realtime WebSocket closed.'));
      };

      socket.onerror = (error) => {
        if (this.ws !== socket) return;
        console.warn('[HasuraRealtime] WebSocket error:', error);
        this.handleConnectionFailure(error);
      };
    } catch (error) {
      console.warn('[HasuraRealtime] Failed to initialize WebSocket:', error);
      this.handleConnectionFailure(error);
    }
  }

  private closeSocket(): void {
    if (this.connectionAckTimer !== null) {
      clearTimeout(this.connectionAckTimer);
      this.connectionAckTimer = null;
    }
    this.isConnected = false;
    this.isConnecting = false;

    const socket = this.ws;
    this.ws = null;
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {
      // Closing a failed connection is best effort.
    }
  }

  private handleConnectionFailure(error: unknown): void {
    this.closeSocket();
    this.notifyAllSubscriptions('unavailable', error);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.subscriptions.size === 0 || this.reconnectTimer !== null || !this.isEnabled()) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectBaseDelayMs * Math.pow(1.5, Math.min(this.reconnectAttempts, 8)),
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subscriptions.size > 0 && !this.isConnected) this.connect();
    }, delay);
  }

  private handleMessage(message: any): void {
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'connection_ack':
        if (this.connectionAckTimer !== null) {
          clearTimeout(this.connectionAckTimer);
          this.connectionAckTimer = null;
        }
        this.isConnecting = false;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        for (const subscription of this.subscriptions.values()) {
          this.setSubscriptionStatus(subscription, 'connecting');
          this.sendSubscription(subscription);
        }
        break;

      case 'connection_error':
      case 'connection_reject':
        this.handleConnectionFailure(message.payload ?? new Error('Hasura rejected the WebSocket connection.'));
        break;

      case 'data': {
        const subscription = this.subscriptions.get(String(message.id));
        if (!subscription) break;
        if (subscription.resultTimer !== null) {
          clearTimeout(subscription.resultTimer);
          subscription.resultTimer = null;
        }
        this.setSubscriptionStatus(subscription, 'live');
        if (message.payload && Object.prototype.hasOwnProperty.call(message.payload, 'data')) {
          try {
            subscription.onData(message.payload.data);
          } catch (error) {
            console.error('[HasuraRealtime] Callback execution error:', error);
          }
        }
        break;
      }

      case 'error': {
        const subscription = this.subscriptions.get(String(message.id));
        if (!subscription) break;
        const error = message.payload ?? new Error('Hasura subscription failed.');
        this.setSubscriptionStatus(subscription, 'unavailable', error);
        if (subscription.onError) subscription.onError(error);
        else console.warn('[HasuraRealtime] Subscription error:', message.id, error);
        break;
      }

      case 'ka':
      case 'ping':
        break;
    }
  }

  private send(payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private sendSubscription(subscription: ActiveSubscription): void {
    if (subscription.resultTimer !== null) clearTimeout(subscription.resultTimer);
    subscription.resultTimer = setTimeout(() => {
      subscription.resultTimer = null;
      this.setSubscriptionStatus(
        subscription,
        'unavailable',
        new Error('Hasura subscription did not return its initial result in time.'),
      );
    }, this.initialResultTimeoutMs);

    const sent = this.send({
      id: subscription.id,
      type: 'start',
      payload: {
        query: subscription.query,
        variables: subscription.variables,
      },
    });
    if (!sent) {
      clearTimeout(subscription.resultTimer);
      subscription.resultTimer = null;
      this.setSubscriptionStatus(subscription, 'unavailable', new Error('Could not send the Hasura subscription.'));
    }
  }

  public subscribe<T = any>(
    query: string,
    variables: Record<string, unknown> | undefined,
    onData: SubscriptionCallback<T>,
    onError?: HasuraRealtimeErrorHandler,
    onStatus?: HasuraRealtimeStatusHandler,
  ): () => void {
    if (!this.isEnabled()) {
      onStatus?.('unavailable', new Error('Hasura Realtime is not configured or enabled.'));
      return () => {};
    }

    this.subCounter += 1;
    const id = `sub_${this.subCounter}_${Date.now()}`;
    const subscription: ActiveSubscription = {
      id,
      query,
      variables,
      onData,
      onError,
      onStatus,
      resultTimer: null,
      status: null,
    };
    this.subscriptions.set(id, subscription);
    this.setSubscriptionStatus(subscription, 'connecting');

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription(subscription);
    } else {
      this.connect();
    }

    return () => {
      const active = this.subscriptions.get(id);
      if (!active) return;
      if (active.resultTimer !== null) clearTimeout(active.resultTimer);
      this.subscriptions.delete(id);
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ id, type: 'stop' });
      }
      if (this.subscriptions.size === 0) {
        if (this.reconnectTimer !== null) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.closeSocket();
      }
    };
  }
}

export const hasuraRealtimeClient = new HasuraWebSocketClient();

export function isHasuraRealtimeEnabled(): boolean {
  return hasuraRealtimeClient.isEnabled();
}

export function subscribeHasura<T = any>(
  query: string,
  variables: Record<string, unknown> | undefined,
  onData: SubscriptionCallback<T>,
  onError?: HasuraRealtimeErrorHandler,
  onStatus?: HasuraRealtimeStatusHandler,
): () => void {
  return hasuraRealtimeClient.subscribe<T>(query, variables, onData, onError, onStatus);
}
