import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import { defaultChatbotSuggestions, sendChatbotMessage, type ChatbotResponse, type ChatbotSuggestion } from './chatbot.api';
import { TypewriterText } from './TypewriterText';

type Message = { id: string; role: 'assistant' | 'customer'; text: string; response?: ChatbotResponse; failed?: boolean; retryText?: string; sensitive?: boolean };
const makeSessionId = () => {
  try { return crypto.randomUUID().replace(/-/g, ''); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`; }
};

export const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [choosingDate, setChoosingDate] = useState(false);
  const [sending, setSending] = useState(false);
  const [isResponseTyping, setIsResponseTyping] = useState(false);
  const [sessionId] = useState(makeSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [completedResponseIds, setCompletedResponseIds] = useState<Set<string>>(() => new Set());
  const [suggestions, setSuggestions] = useState<ChatbotSuggestion[]>(defaultChatbotSuggestions);
  const [context, setContext] = useState<Record<string, unknown>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const typingResponseIdsRef = useRef(new Set<string>());
  const keepLatestMessageVisible = useCallback(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, []);
  const finishResponseTyping = useCallback((messageId: string) => {
    typingResponseIdsRef.current.delete(messageId);
    setCompletedResponseIds(current => new Set(current).add(messageId));
    setIsResponseTyping(typingResponseIdsRef.current.size > 0);
  }, []);

  useEffect(() => { if (isOpen) { inputRef.current?.focus(); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); } }, [isOpen, messages, sending]);
  useEffect(() => { if (choosingDate) inputRef.current?.focus(); }, [choosingDate]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && isOpen) { setIsOpen(false); openerRef.current?.focus(); } };
    window.addEventListener('keydown', onKeyDown as unknown as EventListener);
    return () => window.removeEventListener('keydown', onKeyDown as unknown as EventListener);
  }, [isOpen]);

  const submitMessage = async (rawText: string, retryId?: string, requestContext = context, suggestionId?: string) => {
    const text = rawText.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setInput('');
    setSending(true);
    const customerMessage: Message = { id: `${Date.now()}-user`, role: 'customer', text, sensitive: requestContext.last_intent === 'VISIT_LOOKUP' };
    const assistantId = `${Date.now()}-assistant`;
    if (retryId) setMessages(items => items.filter(item => item.id !== retryId));
    setMessages(items => [...items, customerMessage]);
    try {
      const previousMessages = messages.filter(item => !item.failed && !item.sensitive).slice(-8).map(({ role, text: messageText }) => ({ role, text: messageText.slice(0, 1000) }));
      const response = await sendChatbotMessage({ session_id: sessionId, message: text, context: { ...requestContext, previous_messages: previousMessages }, ...(suggestionId ? { suggestion_id: suggestionId } : {}) });
      typingResponseIdsRef.current.add(assistantId);
      setIsResponseTyping(true);
      setMessages(items => [...items, { id: assistantId, role: 'assistant', text: response.message, response }]);
      setSuggestions(response.intent === 'VISIT_LOOKUP' && response.requires_clarification ? [] : response.suggestions?.length ? response.suggestions : defaultChatbotSuggestions.slice(0, 3));
      if (response.data?.branch_id) setContext(current => ({ ...current, branch_id: response.data.branch_id }));
      if (response.data?.branches?.length === 1 && response.data.branches[0].id) setContext(current => ({ ...current, branch_id: response.data.branches[0].id }));
      if (response.data?.services?.length) setContext(current => ({ ...current, service_ids: Array.from(new Set([...(Array.isArray(current.service_ids) ? current.service_ids as number[] : []), ...response.data.services.map(service => service.id)])).slice(-4) }));
      if (response.intent === 'VISIT_LOOKUP' && response.data?.visit_lookup) setContext(current => response.requires_clarification && response.data.visit_lookup?.invoice_number
        ? ({ ...current, visit_lookup_invoice: response.data.visit_lookup.invoice_number })
        : ({ ...current, visit_lookup_invoice: undefined }));
      if (response.data?.availability_date) setContext(current => ({ ...current, date: response.data.availability_date }));
      setContext(current => ({ ...current, last_intent: response.intent === 'VISIT_LOOKUP' && !response.requires_clarification ? undefined : response.intent }));
    } catch {
      setMessages(items => [...items, { id: assistantId, role: 'assistant', text: 'I would love to accommodate your request, but please try again in a bit.', failed: true, retryText: text }]);
      setSuggestions(defaultChatbotSuggestions.slice(0, 3));
    } finally { sendingRef.current = false; setSending(false); }
  };

  const submitCurrentInput = () => {
    const text = choosingDate && input ? `Which barbers are available on ${input}?` : input;
    setChoosingDate(false);
    void submitMessage(text);
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); submitCurrentInput(); };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitCurrentInput(); } };

  return <div className="fixed bottom-4 right-4 z-[80] sm:bottom-6 sm:right-6">
    {isOpen && <section aria-label="DemoShop AI Assistant" className="mb-3 flex h-[min(72dvh,34rem)] w-[min(calc(100vw-2rem),24rem)] flex-col overflow-hidden rounded-xl border border-gold/30 bg-charcoal shadow-2xl shadow-black/50">
      <header className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-3">
        <div><p className="font-semibold text-ivory">DemoShop AI Assistant</p><p className="text-xs text-ivory/60">Chat with us!</p></div>
        <button type="button" aria-label="Close chatbot" onClick={() => { setIsOpen(false); openerRef.current?.focus(); }} className="rounded-md p-2 text-ivory/70 hover:bg-white/10 hover:text-ivory"><X size={18} /></button>
      </header>
      <div ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-white/[0.07] p-3 text-sm leading-relaxed text-ivory">Hi! Welcome to DemoShop Barbershop! I can help you check available barbers, service prices, branch locations, and more. What would you like to know?</div>}
        {messages.map(message => <div key={message.id} className={`w-fit max-w-[95%] rounded-2xl border p-3 text-sm leading-relaxed shadow-sm ${message.role === 'customer' ? 'ml-auto rounded-tr-sm border-gold/50 bg-gold text-charcoal' : 'rounded-tl-sm border-white/15 bg-charcoal-light text-ivory'}`}>
          <p className="whitespace-pre-wrap break-words">{message.role === 'assistant' && !message.failed
            ? <TypewriterText text={message.text} completionKey={message.id} onProgress={keepLatestMessageVisible} onComplete={finishResponseTyping} />
            : message.text}</p>
          {(['BRANCH_LOCATION', 'BRANCH_DIRECTIONS'].includes(message.response?.intent || '') || message.response?.clarification_field === 'branch_id') && message.response?.data?.branches?.map(branch => <p key={branch.id} className="mt-2 text-xs text-ivory/70">{branch.name}{branch.address ? ` · ${branch.address}` : ''}{branch.maps_url ? <> · <a className="underline" href={branch.maps_url} target="_blank" rel="noreferrer">Map</a></> : null}</p>)}
          {completedResponseIds.has(message.id) && message.response?.intent === 'SERVICE_PRICING' && message.response.data.services.length > 0 && <ul className="mt-2 space-y-1 text-xs text-ivory/80">{message.response.data.services.map(service => <li key={`price-${service.id}`} className="flex justify-between gap-4"><span>{service.name}</span><span className="shrink-0 font-medium text-gold">₱{service.price.toLocaleString('en-PH')}</span></li>)}</ul>}
          {completedResponseIds.has(message.id) && message.response?.intent === 'SERVICE_DETAILS' && message.response.data.services.map(service => <div key={`service-detail-${service.id}`} className="mt-3 rounded-md border border-white/10 bg-black/10 p-2.5 text-xs"><p className="font-semibold text-ivory">{service.name}</p>{service.description && <p className="mt-1 text-ivory/70">{service.description}</p>}<div className="mt-1 flex flex-wrap gap-x-3 text-ivory/70"><span className="font-medium text-gold">₱{service.price.toLocaleString('en-PH')}</span>{service.duration_minutes && <span>{service.duration_minutes} min</span>}</div></div>)}
          {message.response?.data?.price_total !== null && message.response?.data?.price_total !== undefined && <p className="mt-2 text-xs font-semibold text-gold">Total: ₱{message.response.data.price_total.toLocaleString('en-PH')}</p>}
          {message.response?.intent === 'BARBER_AVAILABILITY' && message.response.data.barbers.length > 0 && <p className="mt-3 text-xs font-semibold text-ivory/80">Barbers checked</p>}
          {['BARBER_AVAILABILITY', 'BARBER_RECOMMENDATION'].includes(message.response?.intent || '') && message.response?.data?.barbers?.map(barber => <p key={`barber-${barber.id}`} className="mt-1 text-xs text-ivory/80">{barber.rank ? `${barber.rank}. ` : ''}{barber.name}{barber.specialties.length ? ` · ${barber.specialties.join(', ')}` : ''}</p>)}
          {message.response?.intent === 'BARBER_AVAILABILITY' && message.response.data.availability.length > 0 && <p className="mt-3 text-xs font-semibold text-ivory/80">Appointment availability</p>}
          {message.response?.intent === 'BARBER_AVAILABILITY' && message.response?.data?.availability?.map(entry => <p key={`availability-${entry.barber_id}`} className="mt-1 text-xs text-ivory/70">{entry.barber_name}: {entry.status === 'unverified' ? 'Unable to verify availability' : entry.status === 'not_scheduled' ? 'Not scheduled for appointments' : entry.status === 'online_booking_unavailable' ? 'Online booking unavailable' : entry.status === 'no_openings' ? 'No appointment openings' : entry.slots.map(slot => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(slot.starts_at))).join(', ')}</p>)}
          {message.response?.data?.location && <p className="mt-2 text-xs text-gold"><a href={message.response.data.location.maps_url} target="_blank" rel="noreferrer" className="underline">{message.response.data.location.maps_url.includes('travelmode=transit') ? 'Commute directions' : 'Directions'} from {message.response.data.location.origin}</a></p>}
          {message.response?.requires_clarification && !isResponseTyping && message.response.clarification_field === 'branch_id' && message.response.data.branches.map(branch => <button key={`select-${branch.id}`} type="button" onClick={() => { const lastQuestion = [...messages].reverse().find(item => item.role === 'customer')?.text || 'Check availability'; void submitMessage(lastQuestion, undefined, { ...context, branch_id: branch.id }); }} className="mt-2 mr-2 rounded-full border border-gold/50 px-2.5 py-1 text-xs text-gold hover:bg-gold/10">Use {branch.name}</button>)}
          {message.response?.requires_clarification && !isResponseTyping && message.response.clarification_field === 'service_id' && <div className="mt-2 flex flex-wrap gap-2">{message.response.data.services.slice(0, 8).map(service => <button key={`service-${service.id}`} type="button" onClick={() => { void submitMessage(service.name, undefined, { ...context, service_ids: [service.id] }); }} className="rounded-full border border-gold/50 px-2.5 py-1 text-xs text-gold hover:bg-gold/10">{service.name}</button>)}</div>}
          {message.failed && <button type="button" onClick={() => void submitMessage(message.retryText || '', message.id)} className="mt-2 text-xs font-semibold underline">Retry</button>}
        </div>)}
        {sending && <div className="flex items-center gap-2 text-xs text-ivory/60" aria-label="Assistant is thinking"><LoaderCircle size={15} className="animate-spin" /> Thinking…</div>}
        {suggestions.length > 0 && !sending && !isResponseTyping && <div className="flex flex-wrap gap-2 pt-1">{suggestions.map(item => <button key={item.id} type="button" onClick={() => item.id === 'choose-date' ? (setChoosingDate(true), setInput(''), inputRef.current?.focus()) : void submitMessage(item.query, undefined, context, item.id)} className="rounded-full border border-gold/40 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10">{item.label}</button>)}{messages.length > 1 && <button type="button" onClick={() => setMessages(items => [...items, { id: `${Date.now()}-other`, role: 'customer', text: 'Other' }])} className="rounded-full border border-gold/40 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10">Other</button>}</div>}
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
        <label className="sr-only" htmlFor="demoshop-chatbot-input">Message DemoShop AI Assistant</label>
        <input id="demoshop-chatbot-input" ref={inputRef} type={choosingDate ? 'date' : 'text'} value={input} onChange={event => setInput(event.target.value)} onKeyDown={onInputKeyDown} maxLength={1000} placeholder={choosingDate ? 'Choose a date' : 'Ask about DemoShop…'} disabled={sending} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-ivory outline-none placeholder:text-ivory/40 focus:border-gold/60" />
        <button type="submit" aria-label="Send message" disabled={sending || !input.trim()} className="rounded-lg bg-gold p-2.5 text-charcoal disabled:opacity-45"><Send size={17} /></button>
      </form>
    </section>}
    <button ref={openerRef} type="button" aria-label={isOpen ? 'Close DemoShop AI Assistant' : 'Open DemoShop AI Assistant'} aria-expanded={isOpen} onClick={() => setIsOpen(open => !open)} className="ml-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/60 bg-gold text-charcoal shadow-lg shadow-black/30 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">{isOpen ? <X size={23} /> : <MessageCircle size={24} />}</button>
  </div>;
};


