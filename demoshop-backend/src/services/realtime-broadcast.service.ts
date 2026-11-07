import { getAdminClient } from '../config/supabase';
import logger from '../utils/general/logger';

export type AppointmentBroadcastAction =
  | 'CREATED'
  | 'RESCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'STATUS_CHANGED';

export interface AppointmentBroadcastPayload {
  action: AppointmentBroadcastAction;
  appointmentId?: string | null;
  queueEntryId?: number | null;
  status?: string | null;
  customerId?: string | number | null;
  barberId?: number | null;
  branchId?: number | null;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export class RealtimeBroadcastService {
  private channel: any = null;
  private subscribedPromise: Promise<any> | null = null;
  private mockChannel: any = null;
  private readonly channelName = 'admin-appointments-live-sync';

  /**
   * Allows injecting a mock channel in unit/integration tests.
   */
  setMockChannel(channel: any): void {
    this.mockChannel = channel;
  }

  /**
   * Resets and cleans up any open channel and subscriptions.
   */
  async teardown(): Promise<void> {
    if (this.channel && typeof this.channel.unsubscribe === 'function') {
      try {
        await this.channel.unsubscribe();
      } catch {
        // non-blocking
      }
    }
    this.channel = null;
    this.subscribedPromise = null;
    this.mockChannel = null;
  }

  private async getBroadcastChannel(): Promise<any> {
    if (this.mockChannel) {
      return this.mockChannel;
    }

    if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
      // In test mode, no-op cleanly unless an explicit mock channel was injected
      return null;
    }

    if (this.channel && this.subscribedPromise) {
      return this.subscribedPromise;
    }

    try {
      let adminClient: any = null;
      try {
        adminClient = getAdminClient();
      } catch {
        return null;
      }

      if (!adminClient || typeof adminClient.channel !== 'function') {
        return null;
      }

      this.channel = adminClient.channel(this.channelName);

      this.subscribedPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.channel = null;
          this.subscribedPromise = null;
          reject(new Error('[RealtimeBroadcastService] Channel subscription timed out after 10000ms'));
        }, 10000);

        if (typeof timeout.unref === 'function') {
          timeout.unref();
        }

        this.channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve(this.channel);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            this.channel = null;
            this.subscribedPromise = null;
            reject(new Error(`[RealtimeBroadcastService] Channel subscribe ended with status: ${status}`));
          }
        });
      });

      return await this.subscribedPromise;
    } catch (err) {
      this.channel = null;
      this.subscribedPromise = null;
      throw err;
    }
  }

  /**
   * Broadcasts an appointment lifecycle change event to listening frontend clients
   * over Supabase Realtime Broadcast.
   */
  async broadcastAppointmentChange(payload: AppointmentBroadcastPayload): Promise<void> {
    try {
      const channel = await this.getBroadcastChannel();
      if (!channel || typeof channel.send !== 'function') {
        return;
      }

      const eventData = {
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      };

      const result = await channel.send({
        type: 'broadcast',
        event: 'appointment_changed',
        payload: eventData,
      });

      if (result === 'error') {
        logger.warn('[RealtimeBroadcastService] Broadcast send returned error status', { eventData });
      } else {
        logger.info('[RealtimeBroadcastService] Broadcast sent successfully', {
          action: payload.action,
          appointmentId: payload.appointmentId,
          queueEntryId: payload.queueEntryId,
        });
      }
    } catch (err: any) {
      logger.warn('[RealtimeBroadcastService] Failed to send broadcast event:', {
        error: err?.message || String(err),
        action: payload.action,
        appointmentId: payload.appointmentId,
        queueEntryId: payload.queueEntryId,
      });
    }
  }

  /**
   * Safely dispatch broadcast without waiting or blocking caller.
   */
  dispatchAppointmentChangeSafely(payload: AppointmentBroadcastPayload): void {
    void this.broadcastAppointmentChange(payload).catch((err) => {
      logger.warn('[RealtimeBroadcastService] Background broadcast error:', {
        error: err?.message || String(err),
        action: payload.action,
      });
    });
  }
}

export const realtimeBroadcastService = new RealtimeBroadcastService();
