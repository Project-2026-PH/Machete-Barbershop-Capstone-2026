import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { useShopSettings } from '@/hooks/useShopSettings';

export const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { settings } = useShopSettings();

  const defaultFaqs = [
    {
      question: "Where is DemoShop Barbershop located in San Jose del Monte?",
      answer: "DemoShop Barbershop is at the Ground Floor of SampleBranch, Brgy. Kaypian, San Jose del Monte, Bulacan. We welcome clients from SJDM and nearby Bulacan communities."
    },
    {
      question: "Do you accept walk-ins?",
      answer: "We prioritize appointments to ensure every client receives our full attention. Walk-ins are accepted based on availability, but we highly recommend booking in advance to secure your preferred time."
    },
    {
      question: "What is your cancellation policy?",
      answer: "We request at least 24 hours notice for cancellations. Late cancellations or no-shows may be subject to a fee of 50% of the service value to compensate our barbers for their time."
    },
    {
      question: "Do you offer services for children?",
      answer: "Yes, we offer the 'Young Gentleman's Cut' for children under 12. We treat them with the same level of precision and care as our adult clients, ensuring a comfortable experience."
    },
    {
      question: "How early should I arrive?",
      answer: "Please arrive 10 minutes before your scheduled time. This allows you to enjoy a complimentary beverage, relax in our lounge, and ensure your service starts promptly."
    },
    {
      question: "Do you sell gift cards?",
      answer: "Absolutely. Physical gift cards are available at all our branches, and digital gift cards can be purchased through our booking portal."
    }
  ];

  const faqs = (settings?.faqs && settings.faqs.length > 0)
    ? [...settings.faqs]
        .filter((f) => f.isEnabled !== false)
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    : defaultFaqs;

  return (
    <section className="py-24 bg-charcoal relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 animate-fade-in">
          <span className="text-gold font-serif italic text-xl mb-2 block">Good to Know</span>
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-ivory mb-6">
            FREQUENTLY ASKED
          </h2>
          <div className="h-[1px] w-24 bg-gold mx-auto"></div>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="border border-white/10 bg-white/5 rounded-sm overflow-hidden transition-all duration-300 hover:border-gold/30 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full p-6 flex justify-between items-center text-left"
              >
                <span className={`font-serif font-bold text-lg transition-colors ${openIndex === index ? 'text-gold' : 'text-ivory'}`}>
                  {faq.question}
                </span>
                {openIndex === index ? (
                  <Minus className="w-5 h-5 text-gold shrink-0" />
                ) : (
                  <Plus className="w-5 h-5 text-ivory-dim shrink-0" />
                )}
              </button>
              
              <div 
                className={`overflow-hidden transition-all duration-500 ease-in-out ${
                  openIndex === index ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="p-6 pt-0 text-ivory-dim font-light leading-relaxed border-t border-white/5 mt-2">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
