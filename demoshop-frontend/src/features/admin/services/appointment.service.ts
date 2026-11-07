import { api } from '@/config/api';
import type {
  AppointmentListResponse,
  CancelAppointmentPayload,
  AppointmentRecord,
  CustomerBookingStats,
  AppointmentFilterStatus,
} from '@demoshop/shared-types';

export interface FetchAppointmentsParams {
  status?: AppointmentFilterStatus | string;
  search?: string;
  barberId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  scope?: 'active' | 'history';
  view?: 'today' | 'overdue';
  origin?: 'in_app';
  sort?: 'newest' | 'oldest';
}

export const appointmentApiService = {
  async getAppointments(params: FetchAppointmentsParams = {}): Promise<AppointmentListResponse> {
    const response = await api.get<AppointmentListResponse>('/api/appointments', {
      params,
    });
    return response.data;
  },

  async getAppointmentById(id: string): Promise<AppointmentRecord> {
    const response = await api.get<AppointmentRecord>(`/api/appointments/${id}`);
    return response.data;
  },

  async cancelAppointment(
    appointmentId: string,
    payload: CancelAppointmentPayload
  ): Promise<{ success: boolean; message: string; appointment: AppointmentRecord }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      appointment: AppointmentRecord;
    }>(`/api/appointments/${appointmentId}/cancel`, payload);
    return response.data;
  },

  async confirmAppointment(
    appointmentId: string
  ): Promise<{ success: boolean; message: string; appointment: AppointmentRecord }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      appointment: AppointmentRecord;
    }>(`/api/appointments/${appointmentId}/confirm`);
    return response.data;
  },

  async declineAppointment(
    appointmentId: string,
    payload: { reason?: string } = {}
  ): Promise<{ success: boolean; message: string; appointment: AppointmentRecord }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      appointment: AppointmentRecord;
    }>(`/api/appointments/${appointmentId}/decline`, payload);
    return response.data;
  },

  async getCustomerStats(customerId: string): Promise<CustomerBookingStats> {
    const response = await api.get<CustomerBookingStats>(
      `/api/appointments/customer/${customerId}/stats`
    );
    return response.data;
  },
};

export default appointmentApiService;
