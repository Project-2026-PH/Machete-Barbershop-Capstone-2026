import { queueService } from '../../services/queue.service';
import { adminRepository } from '../../repositories/admin.repository';
import { serviceRepository } from '../../repositories/service.repository';
import { validateServiceCombo } from '@demoshop/shared-types';
import { ChatbotResponseSchema, type ChatbotRequest, type ChatbotResponse } from './chatbot.schemas';
import { classifyIntent } from './intent.classifier';
import { chatbotRepository } from './chatbot.repository';
import { generateGroundedMessage } from './ai/gemini.client';
import type { ChatbotIntent } from './types';
import { chatbotTelemetry } from './chatbot.telemetry';
import { isLookupValueClose } from './visit-lookup.util';

const DEFAULT_SUGGESTIONS = [
  { id: 'available-barbers', label: 'Available barbers', query: 'Which barbers are available today?' },
  { id: 'service-prices', label: 'Services & prices', query: 'How much do your services cost?' },
  { id: 'branch-locations', label: 'Branch locations', query: 'Where are your branches?' },
  { id: 'directions', label: 'How to get there', query: 'How do I get to the branch?' },
  { id: 'barber-recommendation', label: 'Recommend a barber', query: 'Can you recommend a barber?' },
  { id: 'opening-hours', label: 'Opening hours', query: 'What are your opening hours?' },
  { id: 'last-barber', label: 'Who was my last barber?', query: 'Nakalimutan ko kung sino nagpagupit sa akin before.' },
];

const emptyData = (): any => ({ branch_id: null, availability_date: null, price_total: null, price_currency: null, branches: [], faqs: [], barbers: [], services: [], availability: [], location: null, visit_lookup: null });

// Keep provider input proportional to the question. The API response DTO can
// contain UI data, but Gemini only needs a small, intent-specific projection.
const groundingRecords = (intent: ChatbotIntent, data: any) => {
  switch (intent) {
    case 'SERVICE_PRICING':
      return { price_total: data.price_total, price_currency: data.price_currency, services: data.services.slice(0, 20).map(({ id, name, price, currency, duration_minutes }: any) => ({ id, name: String(name).slice(0, 120), price, currency, duration_minutes })) };
    case 'SERVICE_DETAILS':
      return { services: data.services.slice(0, 12).map(({ id, name, description, price, currency, duration_minutes }: any) => ({ id, name: String(name).slice(0, 120), description: typeof description === 'string' ? description.slice(0, 500) : null, price, currency, duration_minutes })) };
    case 'BRANCH_LOCATION':
    case 'BRANCH_DIRECTIONS':
    case 'OPERATING_HOURS':
      return { branches: data.branches.slice(0, 20).map(({ id, name, address, maps_url, opening_hours }: any) => ({ id, name: String(name).slice(0, 120), address: typeof address === 'string' ? address.slice(0, 300) : null, maps_url, opening_hours: Array.isArray(opening_hours) ? opening_hours.map((hours: any) => ({ ...hours, openTime: formatBusinessTime(String(hours.openTime || '')), closeTime: formatBusinessTime(String(hours.closeTime || '')) })) : opening_hours })) , location: data.location };
    case 'BARBER_AVAILABILITY':
    case 'BARBER_RECOMMENDATION':
      return {
        branch_id: data.branch_id,
        availability_date: data.availability_date,
        services: data.services.slice(0, 4),
        barbers: data.barbers.slice(0, 20).map(({ id, name, branch_id, specialties, rank, explanation }: any) => ({ id, name: String(name).slice(0, 120), branch_id, specialties: specialties.slice(0, 8).map((skill: string) => skill.slice(0, 60)), rank, explanation })),
        availability: data.availability.slice(0, 20).map(({ barber_id, barber_name, slots, checked, status, observed_at }: any) => ({ barber_id, barber_name, slots: slots.slice(0, 24), checked, status, observed_at })),
      };
    case 'GENERAL_FAQ':
    case 'BOOKING_INFORMATION':
      return { faqs: data.faqs.slice(0, 3).map(({ question, answer }: any) => ({ question: question.slice(0, 300), answer: answer.slice(0, 700) })) };
    default:
      return {};
  }
};

const pickSuggestions = (intent: ChatbotIntent, clarification: ChatbotResponse['clarification_field']) => {
  if (intent === 'VISIT_LOOKUP' && clarification) return [];
  if (intent === 'VISIT_LOOKUP') return [
    { id: 'last-barber', label: 'Look up another visit', query: 'Nakalimutan ko kung sino nagpagupit sa akin before.' },
    ...DEFAULT_SUGGESTIONS.filter((item) => ['service-prices', 'available-barbers'].includes(item.id)),
  ];
  if (clarification === 'date') return [
    { id: 'check-today', label: 'Today', query: 'Which barbers are available today?' },
    { id: 'check-tomorrow', label: 'Tomorrow', query: 'Which barbers are available tomorrow?' },
    { id: 'choose-date', label: 'Choose a date', query: 'Choose a date' },
  ];
  const relevant = intent === 'SERVICE_PRICING' || intent === 'SERVICE_DETAILS' ? ['available-barbers', 'opening-hours', 'branch-locations']
    : intent === 'BRANCH_DIRECTIONS' ? ['opening-hours', 'available-barbers', 'service-prices']
      : intent === 'BARBER_RECOMMENDATION' ? ['available-barbers', 'service-prices', 'branch-locations']
        : intent === 'BARBER_AVAILABILITY' ? ['service-prices', 'opening-hours', 'branch-locations'] : [];
  const chosen = relevant.map(id => DEFAULT_SUGGESTIONS.find((item) => item.id === id)).filter((item): item is typeof DEFAULT_SUGGESTIONS[number] => Boolean(item));
  return (chosen.length ? chosen : DEFAULT_SUGGESTIONS.slice(0, 3)).slice(0, 3);
};

const manilaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isCalendarDate = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const parseDate = (message: string, supplied?: string | null) => {
  const explicitDate = /\b(\d{4}-\d{2}-\d{2})\b/.exec(message)?.[1];
  if (isCalendarDate(explicitDate)) return explicitDate;
  if (/\btomorrow\b|bukas/i.test(message)) { const d = new Date(`${manilaDate()}T12:00:00+08:00`); d.setDate(d.getDate() + 1); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  if (/\btoday\b|ngayon/i.test(message)) return manilaDate();
  return supplied || null;
};

const toManilaIso = (date: string, time: string): string | null => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00+08:00`).toISOString();
};

const formatBusinessTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  if (hour > 23 || Number(match[2]) > 59) return value;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
};

const makeResponse = (intent: ChatbotIntent, status: ChatbotResponse['status'], message: string, data = emptyData(), clarification: ChatbotResponse['clarification_field'] = null): ChatbotResponse => {
  try {
    return ChatbotResponseSchema.parse({
      status, intent, message: message.slice(0, 1600), data, suggestions: pickSuggestions(intent, clarification), requires_clarification: clarification !== null,
      clarification_field: clarification, generated_at: new Date().toISOString(),
    });
  } catch {
    chatbotTelemetry.record('json_validation', { outcome: 'failure' });
    throw new Error('CHATBOT_RESPONSE_VALIDATION_FAILED');
  }
};

const withGemini = async (intent: ChatbotIntent, query: string, records: unknown, fallback: string, previousMessages?: Array<{ role: 'customer' | 'assistant'; text: string }>) => {
  try { return await Promise.race([generateGroundedMessage({ intent, query, retrieved: records, fallback, previousMessages }), new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 8000))]); }
  catch { chatbotTelemetry.record('gemini', { outcome: 'fallback' }); return fallback; }
};

export const chatbotService = {
  suggestions: () => DEFAULT_SUGGESTIONS,
  async message(input: ChatbotRequest): Promise<ChatbotResponse> {
    if (/\b(?:bir|accredit(?:ed|ation)|tax invoice|sales invoice)\b/i.test(input.message)) {
      return makeResponse(
        'GENERAL_FAQ',
        'success',
        'Yes. DemoShop Barbershop issues BIR-accredited sales invoices. The receipt lists DEMOSHOP’S R18 BARBER SHOP as the registered name and states that the document is not valid for claiming input tax.',
      );
    }
    const baseClassification = classifyIntent(input.message);
    let classified = baseClassification;
    if (baseClassification.intent === 'OUT_OF_SCOPE' && input.context?.last_intent === 'VISIT_LOOKUP') {
      classified = { ...baseClassification, intent: 'VISIT_LOOKUP' };
    } else if (baseClassification.intent === 'OUT_OF_SCOPE' && ['SERVICE_PRICING', 'SERVICE_DETAILS'].includes(input.context?.last_intent || '')) {
      const normalizedMessage = input.message.toLowerCase().replace(/[^a-z0-9]/g, '');
      const asksForDetails = /\b(what|ano|tell me|details?|include|meaning|means|duration|long|about)\b/i.test(input.message);
      if (asksForDetails) {
        const publishedServices = await chatbotRepository.services();
        const mentionsPublishedService = publishedServices.some((service: any) => {
          const normalizedName = service.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normalizedName.length >= 4 && normalizedMessage.includes(normalizedName);
        });
        if (mentionsPublishedService) classified = { ...baseClassification, intent: 'SERVICE_DETAILS' };
      }
    } else if (baseClassification.intent === 'OUT_OF_SCOPE' && input.context?.last_intent === 'BRANCH_DIRECTIONS' && /\b(?:taga|galing sa|galing akong|galing ako sa|mula sa|from)\s+\S/i.test(input.message)) {
      classified = { ...baseClassification, intent: 'BRANCH_DIRECTIONS' };
    }
    if (classified.intent === 'OUT_OF_SCOPE' || (classified.intent === 'UNSAFE_REQUEST' && !classified.separableBusinessQuestion)) {
      const intent = classified.intent;
      const text = intent === 'UNSAFE_REQUEST'
        ? 'I can’t help with private, administrative, or system information. I can answer questions about DemoShop services, barbers, branches, hours, and booking.'
        : `I don’t have verified information to answer “${input.message.slice(0, 160)}.” I can help with DemoShop services, barbers, branches, hours, directions, and booking information.`;
      return makeResponse(intent, 'refused', text);
    }

    const followupIntents: ChatbotIntent[] = ['SERVICE_PRICING', 'SERVICE_DETAILS', 'BARBER_AVAILABILITY', 'BARBER_RECOMMENDATION', 'BRANCH_DIRECTIONS', 'OPERATING_HOURS', 'BOOKING_INFORMATION', 'VISIT_LOOKUP'];
    const intent = classified.intent === 'GENERAL_FAQ' && followupIntents.includes(input.context?.last_intent as ChatbotIntent)
      ? input.context?.last_intent as ChatbotIntent
      : classified.intent;
    const branchId = input.context?.branch_id ?? null;
    const serviceId = input.context?.service_id ?? null;
    const date = parseDate(input.message, input.context?.date);
    let data = emptyData();
    let fallback = 'I could not verify that information just now. Please try again in a moment.';
    let clarification: ChatbotResponse['clarification_field'] = null;

    if (intent === 'VISIT_LOOKUP') {
      data.visit_lookup = { invoice_number: null, visit_date: null, customer_name: null, service_name: null, barber_name: null, performed_at: null };
      const priorInvoice = input.context?.last_intent === 'VISIT_LOOKUP' ? input.context?.visit_lookup_invoice : null;
      if (priorInvoice) {
        data.visit_lookup.invoice_number = priorInvoice;
        const record = await chatbotRepository.findVisitByInvoice(priorInvoice, input.message);
        if (record) {
          const visitDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(record.performed_at));
          data.visit_lookup = { invoice_number: record.invoice_number, visit_date: visitDate, customer_name: null, service_name: record.service_name, barber_name: record.barber_name, performed_at: record.performed_at };
          fallback = `Kita ko na, si ${record.barber_name} yung naggupit sa iyo noong ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.performed_at))} (oras sa Pilipinas). May iba ka pa bang gustong malaman tungkol sa visit na ito?`;
          return makeResponse(intent, 'success', fallback, data);
        }
        fallback = 'Hindi ko pa ma-verify ang resibo. Pakitingnan ang Guest Ref o Visit Lookup Code at subukan ulit.';
        clarification = 'visit_lookup_verifier';
        return makeResponse(intent, 'clarification', fallback, data, clarification);
      }

      const prefixedInvoice = /\b([A-Z0-9]{3})\s*[-:#]?\s*((?=[A-Z0-9]*\d)[A-Z0-9]{1,12})\b/i.exec(input.message);
      const prefixedInvoiceSuffix = prefixedInvoice && isLookupValueClose('MCH', prefixedInvoice[1]) ? prefixedInvoice[2] : null;
      const invoiceMatch = /^\s*(?:invoice(?:\s*(?:no\.?|number))?\s*[:#-]?\s*)?([0-9]{1,12})\s*$/i.exec(input.message);
      const invoiceDigits = (prefixedInvoiceSuffix || invoiceMatch?.[1])?.toUpperCase() || null;
      const invoiceNumber = invoiceDigits && /^[A-Z0-9]{1,12}$/.test(invoiceDigits) ? `MCH - ${invoiceDigits}` : null;
      if (!invoiceNumber) {
        clarification = 'invoice_number';
        fallback = 'Sige, tutulungan kitang hanapin. Kung nasa iyo pa ang resibo, ilagay dito ang Invoice No. mo. Halimbawa: MCH - 0123.';
      } else {
        data.visit_lookup.invoice_number = invoiceNumber;
        clarification = 'visit_lookup_verifier';
        fallback = 'Salamat. Para matiyak na tamang resibo ito, ilagay naman ang Guest Ref o Visit Lookup Code na nasa resibo mo.';
      }
      return makeResponse(intent, 'clarification', fallback, data, clarification);
    }

    if (intent === 'SERVICE_PRICING' || intent === 'SERVICE_DETAILS') {
      const services = await chatbotRepository.services();
      const terms = input.message.toLowerCase().split(/[^a-z0-9]+/).filter((word: string) => word.length > 2);
      const matched = services.filter((service: any) => terms.some((term: string) => service.name.toLowerCase().includes(term))).slice(0, 8);
      const explicitlyNamed = services.filter((service: any) => input.message.toLowerCase().includes(service.name.toLowerCase()));
      if (explicitlyNamed.length > 1) {
        const comboRecords = await serviceRepository.findByIds(explicitlyNamed.map((service: any) => service.id));
        if (!validateServiceCombo(comboRecords)) {
          data.price_total = explicitlyNamed.reduce((total: number, service: any) => total + service.price, 0);
          data.price_currency = 'PHP';
        }
      }
      data.services = (explicitlyNamed.length ? explicitlyNamed : matched.length ? matched : services).slice(0, 12);
      fallback = !data.services.length ? 'I could not find the requested published service information.' : intent === 'SERVICE_DETAILS' ? 'Here are the published service details:' : 'Here are the current service prices:';
    } else if (intent === 'BRANCH_LOCATION' || intent === 'BRANCH_DIRECTIONS') {
      const branches = await chatbotRepository.branches();
      data.branches = branches;
      const namedBranch = branches.find((item: any) => input.message.toLowerCase().includes(item.name.toLowerCase()));
      const branch = branches.find((item: any) => item.id === branchId) || namedBranch || (branches.length === 1 ? branches[0] : null);
      if (branch) data.branch_id = branch.id;
      if (!branch && branches.length > 1) { clarification = 'branch_id'; fallback = 'Which branch would you like information about?'; }
      else if (intent === 'BRANCH_DIRECTIONS' && branch) {
        const originFromMessage = /\b(?:from|mula sa|taga|galing sa|galing akong|galing ako sa)\s+(.+?)(?=\s*(?:,|[.!?]|(?:paano|pano|how|saan|where)\b|$))/i.exec(input.message)?.[1]?.trim();
        const origin = originFromMessage && originFromMessage.length <= 120 ? originFromMessage : input.context?.origin?.trim() || 'SampleBranch SJDM, Bulacan';
        const requestedTransit = /\b(commut(?:e|ing)|public transport|jeep(?:ney)?|bus|sakay|transit)\b/i.test(input.message);
        const originFollowup = Boolean(originFromMessage && /\b(?:taga|galing sa|galing akong|galing ako sa|mula sa)\b/i.test(input.message));
        const travelMode = requestedTransit || (originFollowup && !/\b(drive|driving|car|walk|walking)\b/i.test(input.message)) ? 'transit' : null;
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(branch.address || branch.name)}${travelMode ? `&travelmode=${travelMode}` : ''}`;
        data.location = { branch_id: branch.id, address: branch.address, origin, maps_url: mapsUrl, steps: [], travel_time_minutes: null };
        fallback = travelMode === 'transit'
          ? `Open Google Maps for public transit directions from ${origin} to ${branch.name}. Google Maps will show currently available route options; I do not have verified step-by-step transit instructions or travel-time information here.`
          : `Open Google Maps for directions from ${origin} to ${branch.name}. I do not have verified step-by-step route or travel-time information here.`;
      } else fallback = branches.length ? 'Here are our branches:' : 'I could not find published branch locations.';
    } else if (intent === 'BARBER_AVAILABILITY' || intent === 'BARBER_RECOMMENDATION') {
      const branches = await chatbotRepository.branches();
      data.branches = branches;
      const namedBranch = branches.find((item: any) => input.message.toLowerCase().includes(item.name.toLowerCase()));
      const validContextBranchId = branches.find((item: any) => item.id === branchId)?.id;
      const selectedBranchId = validContextBranchId || namedBranch?.id || (branches.length === 1 ? branches[0].id : null);
      const services = await chatbotRepository.services();
      const serviceMatches = services.filter((service: any) => input.message.toLowerCase().includes(service.name.toLowerCase()));
      const contextServiceIds = input.context?.service_ids || (serviceId ? [serviceId] : []);
      const selectedServices = /\bboth\b|\bboth services\b|\bboth of them\b|pareho/i.test(input.message)
        ? services.filter((service: any) => [...contextServiceIds, ...serviceMatches.map((item: any) => item.id)].includes(service.id))
        : serviceMatches.length ? serviceMatches : services.filter((service: any) => contextServiceIds.includes(service.id)).slice(0, 1);
      const selectedServiceIds = selectedServices.map((service: any) => service.id);
      data.services = selectedServices;
      data.branch_id = selectedBranchId;
      data.availability_date = date;
      if (!selectedBranchId) { clarification = 'branch_id'; fallback = 'Which DemoShop branch would you like me to check?'; }
      else if (!date) { clarification = 'date'; fallback = 'What date should I check? You can say today or tomorrow.'; }
      else if (selectedServiceIds.length === 0) { data.services = services.slice(0, 8); clarification = 'service_id'; fallback = 'To check accurate openings, which service are you planning to get? Appointment length depends on the service.'; }
      else {
        const barberIds = input.context?.barber_id ? [input.context.barber_id] : await chatbotRepository.barberIdsForBranch(selectedBranchId);
        const result = await chatbotTelemetry.tool('validated_availability', () => queueService.getBatchAvailability(selectedBranchId, date, selectedServiceIds, barberIds, { requireValidatedSchedule: true }));
        const observedAt = new Date().toISOString();
        const typed = result as any;
        data.branch_id = selectedBranchId;
        data.availability_date = date;
        const availabilityByBarber = typed.barbers || {};
        data.availability = barberIds.map((barberId: number) => {
          const availability = availabilityByBarber[String(barberId)];
          const scheduleAllowsBooking = availability?.isOnDuty !== false && availability?.isOnlineBookingEnabled !== false;
          return {
            barber_id: barberId, checked: Boolean(availability), observed_at: observedAt,
            status: !availability ? 'unverified' : availability.isOnDuty === false ? 'not_scheduled' : availability.isOnlineBookingEnabled === false ? 'online_booking_unavailable' : (availability.availableSlots || []).length ? 'available' : 'no_openings',
            slots: !availability || !scheduleAllowsBooking ? [] : (availability.availableSlots || [])
              .map((slot: any) => toManilaIso(date, slot.hour)).filter((startsAt: string | null): startsAt is string => startsAt !== null).map((starts_at: string) => ({ starts_at, is_available: true as const })),
          };
        });
        if (!data.availability.some((entry: any) => entry.checked)) chatbotTelemetry.record('grounding', { outcome: 'availability_unverified' });
        const barbers = await chatbotRepository.barbers(selectedBranchId, date);
        const publicBarberNames = new Map(barbers.map((barber: any) => [barber.id, barber.name]));
        data.availability = data.availability.map((entry: any) => ({ ...entry, barber_name: publicBarberNames.get(entry.barber_id) || `Barber ${entry.barber_id}` }));
        if (intent === 'BARBER_RECOMMENDATION') {
          const bookableBarbers = new Set(data.availability.filter((entry: any) => entry.slots.length > 0).map((entry: any) => entry.barber_id));
          const requestedTerms = `${input.message} ${selectedServices.map((service: any) => service.name).join(' ')}`.toLowerCase().split(/[^a-z0-9]+/).filter((word: string) => word.length > 2);
          const isHaircutRequest = selectedServices.some((service: any) => /hair\s*cut|haircut/i.test(service.name));
          const ranked = barbers.filter((barber: any) => bookableBarbers.has(barber.id) && (!input.context?.barber_id || barber.id === input.context.barber_id))
            .map((barber: any) => ({
              ...barber,
              availableSlotCount: data.availability.find((entry: any) => entry.barber_id === barber.id)?.slots.length || 0,
              matchedSpecialties: barber.specialties.filter((skill: string) => requestedTerms.some((term: string) => skill.toLowerCase().includes(term))),
              assumedHaircutEligibility: isHaircutRequest && barber.specialties.length === 0,
            }))
            .filter((barber: any) => barber.matchedSpecialties.length > 0 || barber.assumedHaircutEligibility)
            .sort((left: any, right: any) => right.availableSlotCount - left.availableSlotCount || right.matchedSpecialties.length - left.matchedSpecialties.length)
            .map((barber: any, index: number) => ({ id: barber.id, name: barber.name, branch_id: selectedBranchId, specialties: barber.matchedSpecialties, rank: index + 1, explanation: barber.assumedHaircutEligibility ? 'Recommended for a standard haircut; specialty information is not published.' : `Published specialties: ${barber.matchedSpecialties.join(', ')}` }));
          data.barbers = ranked;
          if (!ranked.length) fallback = 'I could not verify an available barber with a published specialty matching that request.';
          else if (ranked.some((barber: any) => barber.explanation?.includes('specialty information is not published'))) fallback = `Based on verified appointment openings, I recommend ${ranked.map((barber: any) => barber.name).join(', ')} for a standard haircut. Specialty information is not published, so this is a general recommendation.`;
          else fallback = `Based on published specialties and verified appointment openings, I recommend ${ranked.map((barber: any) => barber.name).join(', ')}.`;
        } else {
          data.barbers = barbers
            .filter((barber: any) => data.availability.some((entry: any) => entry.barber_id === barber.id))
            .map((barber: any) => ({ id: barber.id, name: barber.name, branch_id: selectedBranchId, specialties: barber.specialties, rank: null, explanation: null }));
          const checkedAvailability = data.availability.filter((entry: any) => entry.checked);
          const verifiedSlots = checkedAvailability.reduce((n: number, item: any) => n + item.slots.length, 0);
          if (!checkedAvailability.length) fallback = `I could not verify barber availability for ${date}.`;
          else if (verifiedSlots > 0) fallback = `${verifiedSlots} verified appointment times are available for ${date}. Availability can change; booking will recheck the slot.`;
          else if (checkedAvailability.length < data.availability.length) fallback = `I found no openings among the barbers whose schedules I could verify for ${date}. I could not verify every barber.`;
          else if (data.availability.some((entry: any) => entry.status === 'not_scheduled')) fallback = `I could not find appointment openings for ${date}. Some barbers are not scheduled for appointments that day.`;
          else if (data.availability.some((entry: any) => entry.status === 'online_booking_unavailable')) fallback = `I could not find online appointment openings for ${date}. Online booking is unavailable for some barbers.`;
          else fallback = `There are no verified appointment openings for ${date}.`;
        }
      }
    } else if (intent === 'OPERATING_HOURS') {
      const branches = await chatbotRepository.branches();
      data.branches = branches;
      const namedBranch = branches.find((item: any) => input.message.toLowerCase().includes(item.name.toLowerCase()));
      const selectedBranch = branches.find((item: any) => item.id === branchId) || namedBranch || (branches.length === 1 ? branches[0] : null);
      if (!selectedBranch && branches.length > 1) { clarification = 'branch_id'; fallback = 'Which branch hours would you like to check?'; }
      else {
        const branch = selectedBranch || branches[0];
        if (branch) {
          data.branch_id = branch.id;
          const settings = await adminRepository.getShopSettings(branch.id).catch(() => null) as any;
          const hours = Array.isArray(settings?.businessHours) ? settings.businessHours.map((item: any) => ({ day: String(item.day || ''), openTime: String(item.openTime || ''), closeTime: String(item.closeTime || ''), isOpen: Boolean(item.isOpen) })) : [];
          fallback = 'The shop operates from 9:00 AM to 9:00 PM. Our customer cutoff is 8:30 PM, and we cannot accept customers after the cutoff.';
          data.branches = branches.map((item: any) => item.id === branch.id ? { ...item, opening_hours: hours } : item);
        }
      }
    } else {
      const branches = await chatbotRepository.branches();
      data.branches = branches;
      const faqBranch = branches.find((item: any) => item.id === branchId) || branches[0];
      if (faqBranch) {
        data.branch_id = faqBranch.id;
        const settings = await adminRepository.getShopSettings(faqBranch.id).catch(() => null) as any;
        const records = Array.isArray(settings?.faqs) ? settings.faqs
          .filter((faq: any) => faq && faq.isEnabled !== false && typeof faq.question === 'string' && typeof faq.answer === 'string')
          .slice(0, 50).map((faq: any, index: number) => ({ id: String(faq.id || index + 1).slice(0, 80), question: faq.question.slice(0, 300), answer: faq.answer.slice(0, 700) })) : [];
        const queryWords = input.message.toLowerCase().split(/[^a-z0-9]+/).filter((word: string) => word.length > 3);
        const matching = records.filter((faq: any) => queryWords.some((word: string) => `${faq.question} ${faq.answer}`.toLowerCase().includes(word))).slice(0, 3);
        data.faqs = matching;
        fallback = matching.length
          ? matching.map((faq: any) => `${faq.question} ${faq.answer}`).join(' ')
          : 'For reservations, choose a branch, service, barber, and time in the booking page. Availability is checked again when you submit a reservation.';
      } else fallback = 'I could not retrieve DemoShop’s published FAQs right now.';
    }

    if (clarification) return makeResponse(intent, 'clarification', fallback, data, clarification);
    const message = intent === 'SERVICE_PRICING' || intent === 'SERVICE_DETAILS' || intent === 'BRANCH_DIRECTIONS' || intent === 'BRANCH_LOCATION' || intent === 'OPERATING_HOURS'
      ? fallback
      : await withGemini(intent, classified.safeMessage, groundingRecords(intent, data), fallback, input.context?.previous_messages);
    return makeResponse(intent, 'success', message, data);
  },
};
