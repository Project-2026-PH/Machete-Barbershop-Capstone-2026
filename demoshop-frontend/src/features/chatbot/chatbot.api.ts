import { api } from '@/config/api';

export interface ChatbotSuggestion { id: string; label: string; query: string; }
export interface ChatbotResponse {
  status: 'success' | 'clarification' | 'refused' | 'error';
  intent: string;
  message: string;
  suggestions: ChatbotSuggestion[];
  requires_clarification: boolean;
  clarification_field: 'branch_id' | 'date' | 'service_id' | 'barber_id' | 'origin' | 'invoice_number' | 'visit_lookup_verifier' | null;
  data: {
    branch_id: number | null; availability_date: string | null; price_total: number | null; price_currency: 'PHP' | null;
    branches: Array<{ id: number; name: string; address: string | null; maps_url: string | null }>;
    services: Array<{ id: number; name: string; description: string | null; price: number; currency: 'PHP'; duration_minutes: number | null; price_verified: boolean }>;
    barbers: Array<{ id: number; name: string; branch_id: number | null; specialties: string[]; rank: number | null; explanation: string | null }>;
    availability: Array<{ barber_id: number; barber_name: string; slots: Array<{ starts_at: string; is_available: true }>; checked: boolean; status: 'available' | 'no_openings' | 'not_scheduled' | 'online_booking_unavailable' | 'unverified'; observed_at: string }>;
    location: { branch_id: number; address: string | null; origin: string; maps_url: string; steps: string[]; travel_time_minutes: number | null } | null;
    visit_lookup: { invoice_number: string | null; visit_date: string | null; customer_name: string | null; service_name: string | null; barber_name: string | null; performed_at: string | null } | null;
  };
  generated_at: string;
}

export const defaultChatbotSuggestions: ChatbotSuggestion[] = [
  { id: 'available-barbers', label: 'Available barbers', query: 'Which barbers are available today?' },
  { id: 'service-prices', label: 'Services & prices', query: 'How much do your services cost?' },
  { id: 'branch-locations', label: 'Branch locations', query: 'Where are your branches?' },
  { id: 'directions', label: 'How to get there', query: 'How do I get to the branch?' },
  { id: 'barber-recommendation', label: 'Recommend a barber', query: 'Can you recommend a barber?' },
  { id: 'opening-hours', label: 'Opening hours', query: 'What are your opening hours?' },
  { id: 'last-barber', label: 'Who was my last barber?', query: 'Nakalimutan ko kung sino nagpagupit sa akin before.' },
];

export const sendChatbotMessage = async (payload: { session_id: string; message: string; context: Record<string, unknown>; suggestion_id?: string }) => {
  const response = await api.post<ChatbotResponse>('/api/public/chatbot/message', payload, { timeout: 15000 });
  return response.data;
};
