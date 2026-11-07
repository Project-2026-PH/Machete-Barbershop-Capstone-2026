import { z } from 'zod';

export const ChatbotIntentSchema = z.enum([
  'BARBER_AVAILABILITY', 'BARBER_RECOMMENDATION', 'SERVICE_PRICING', 'SERVICE_DETAILS',
  'BRANCH_LOCATION', 'BRANCH_DIRECTIONS', 'OPERATING_HOURS',
  'BOOKING_INFORMATION', 'GENERAL_FAQ', 'OUT_OF_SCOPE', 'UNSAFE_REQUEST',
  'VISIT_LOOKUP',
]);

export const ChatbotRequestSchema = z.object({
  session_id: z.string().min(16).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  message: z.string().trim().min(1).max(1000),
  suggestion_id: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
  context: z.object({
    previous_messages: z.array(z.object({ role: z.enum(['customer', 'assistant']), text: z.string().trim().min(1).max(1000) }).strict()).max(8).optional(),
    branch_id: z.number().int().positive().nullable().optional(),
    service_id: z.number().int().positive().nullable().optional(),
    service_ids: z.array(z.number().int().positive()).max(4).optional(),
    barber_id: z.number().int().positive().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    origin: z.string().trim().min(2).max(120).nullable().optional(),
    last_intent: ChatbotIntentSchema.nullable().optional(),
    visit_lookup_invoice: z.string().trim().min(4).max(20).nullable().optional(),
  }).strict().optional(),
}).strict();

export const ChatbotResponseSchema = z.object({
  status: z.enum(['success', 'clarification', 'refused', 'error']),
  intent: ChatbotIntentSchema,
  message: z.string().min(1).max(1600),
  data: z.object({
    branch_id: z.number().int().positive().nullable(),
    availability_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    price_total: z.number().nonnegative().nullable(),
    price_currency: z.literal('PHP').nullable(),
    branches: z.array(z.object({ id: z.number().int().positive(), name: z.string(), address: z.string().nullable(), maps_url: z.string().url().nullable(), opening_hours: z.array(z.object({ day: z.string(), openTime: z.string(), closeTime: z.string(), isOpen: z.boolean() }).strict()).optional() }).strict()).max(20),
    faqs: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string() }).strict()).max(50),
    barbers: z.array(z.object({ id: z.number().int().positive(), name: z.string(), branch_id: z.number().int().positive().nullable(), specialties: z.array(z.string()), rank: z.number().int().positive().nullable(), explanation: z.string().nullable() }).strict()).max(30),
    services: z.array(z.object({ id: z.number().int().positive(), name: z.string(), description: z.string().nullable(), price: z.number().nonnegative(), currency: z.literal('PHP'), duration_minutes: z.number().int().positive().nullable(), price_verified: z.boolean() }).strict()).max(20),
    availability: z.array(z.object({ barber_id: z.number().int().positive(), barber_name: z.string(), slots: z.array(z.object({ starts_at: z.string().datetime(), is_available: z.literal(true) }).strict()).max(60), checked: z.boolean(), status: z.enum(['available', 'no_openings', 'not_scheduled', 'online_booking_unavailable', 'unverified']), observed_at: z.string().datetime() }).strict()).max(30),
    location: z.object({ branch_id: z.number().int().positive(), address: z.string().nullable(), origin: z.string(), maps_url: z.string().url(), steps: z.array(z.string()), travel_time_minutes: z.number().positive().nullable() }).strict().nullable(),
    visit_lookup: z.object({ invoice_number: z.string().max(20).nullable(), visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), customer_name: z.string().max(120).nullable(), service_name: z.string().max(120).nullable(), barber_name: z.string().max(120).nullable(), performed_at: z.string().datetime().nullable() }).strict().nullable(),
  }).strict(),
  suggestions: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(100), query: z.string().min(1).max(180) }).strict()).max(5),
  requires_clarification: z.boolean(),
  clarification_field: z.enum(['branch_id', 'date', 'service_id', 'barber_id', 'origin', 'invoice_number', 'visit_lookup_verifier']).nullable(),
  generated_at: z.string().datetime(),
}).strict();

export type ChatbotRequest = z.infer<typeof ChatbotRequestSchema>;
export type ChatbotResponse = z.infer<typeof ChatbotResponseSchema>;
