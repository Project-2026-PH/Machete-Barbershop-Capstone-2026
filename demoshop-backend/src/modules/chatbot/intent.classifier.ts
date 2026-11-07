import type { ChatbotIntent } from './types';

const unsafe = /(ignore\b.{0,80}\binstructions|system prompt|api key|database administrator|you are now (a )?(database|admin)|act as (an? )?admin|\bexecute\s+(this\s+)?sql|customer (email|phone|address)|admin dashboard endpoint|reveal (your )?(secrets|prompt))/i;
const domain = /(demoshop|barber|barbershop|haircut|hair cut|fade|beard|trim|branch|barber|gupit|gupitan|barbero|magkano|presyo|available|availability|appointment|booking|book|reservation|schedule|oras|saan|paano pumunta|pano|directions|commut(?:e|ing)|public transport|jeep(?:ney)?|sakay|hours|open|close|services?|serbisyo|tomorrow|bukas|today|ngayon|both|pareho|what about|how about|faq|policy|cancel|payment|walk.?in|gift card|arrive|early|service i (got|availed)|what service|which barber (helped|served)|barber (who|that) (helped|served)|my visit|receipt code|lookup code|invoice|guest ref|service ko|anong service|ano(ng)? service|my barber|previous barber|last barber|who cut my hair|sinong barber|sino barber|nakalimutan ko|nagpagupit sa akin)/i;

export interface ClassifiedIntent {
  intent: ChatbotIntent;
  safeMessage: string;
  separableBusinessQuestion: boolean;
}

export const classifyIntent = (rawMessage: string): ClassifiedIntent => {
  const message = rawMessage.trim();
  const hasUnsafe = unsafe.test(message);
  const hasDomain = domain.test(message);
  const safeParts = message.split(/[.!?;\n]+/).filter(part => domain.test(part) && !unsafe.test(part));
  if (hasUnsafe && safeParts.length === 0) return { intent: 'UNSAFE_REQUEST', safeMessage: '', separableBusinessQuestion: false };
  if (!hasDomain) return { intent: 'OUT_OF_SCOPE', safeMessage: '', separableBusinessQuestion: false };

  // Do not pass an injection or unrelated tail to the model. Retrieval remains
  // selected by this fixed allowlist, and unsupported mixtures are conservative.
  const cleanMessage = hasUnsafe ? safeParts.join('. ').trim() : message;
  let intent: ChatbotIntent = 'GENERAL_FAQ';
  if (/(service (i|we) (got|availed|had)|what service|which barber (helped|served)|barber (who|that) (helped|served)|my visit|receipt code|lookup code|invoice no|invoice number|guest ref|service ko|serbisyong nakuha|sinong barber.*(nag gupit|nagupit|nag- accommodate)|anong service|ano(ng)? service|(?:who|which) (?:was|is) my barber|remember (?:who )?my barber(?: last time|last visit|previously)?|my (?:last|previous) barber|who cut my hair last time|sinong barber(?: ko)? (?:last time|noon|last visit)|sino barber ko (?:last time|noon)|nakalimutan ko.*(?:sino|sinong).*(?:nagpagupit|nag gupit|nagupit)|sino(?:ng)? nagpagupit sa akin)/i.test(message)) intent = 'VISIT_LOOKUP';
  else if (/(available|availability|open slot|free slot|bakante|may bakante|may available|schedule.*barber|barber.*schedule)/i.test(message)) intent = 'BARBER_AVAILABILITY';
  else if (/(recommend|suggest|mare-recommend|ire-recommend|best barber|barber.*for)/i.test(message)) intent = 'BARBER_RECOMMENDATION';
  else if (/(service|serbisyo).{0,30}(details?|include|description|duration|what is|ano|details?)|(?:details?|what does|what is included|include|description|duration|ano ang kasama|detalye).{0,40}(service|haircut|hair cut|beard|shave)|(?:how long|gaano katagal).{0,30}(service|haircut|hair cut)/i.test(message)) intent = 'SERVICE_DETAILS';
  else if (/(how much|magkano|price|presyo|cost|rates?)/i.test(message)) intent = 'SERVICE_PRICING';
  else if (/(directions|how to get|paano (?:pumunta|makapunta)|pano (?:pumunta|makapunta)|makapunta|route|commute|travel)/i.test(message)) intent = 'BRANCH_DIRECTIONS';
  else if (/(where|location|address|saan|branch)/i.test(message)) intent = 'BRANCH_LOCATION';
  else if (/(hours|opening|open|close|oras|operating)/i.test(message)) intent = 'OPERATING_HOURS';
  else if (/(booking|book|reservation|cancel|walk.?in|payment)/i.test(message)) intent = 'BOOKING_INFORMATION';
  return { intent, safeMessage: hasUnsafe ? cleanMessage : message, separableBusinessQuestion: hasUnsafe && hasDomain };
};

