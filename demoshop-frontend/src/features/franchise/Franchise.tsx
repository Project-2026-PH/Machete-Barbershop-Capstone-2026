import React from 'react';
import { Button } from '@/components/ui/Button';
import { TrendingUp, ShieldCheck, Users, Building } from 'lucide-react';

export const Franchise = () => {
  const benefits = [
    {
      icon: <TrendingUp className="w-8 h-8 text-gold" />,
      title: "Proven Business Model",
      description: "Join a system that has already cracked the code on premium grooming. Our operational playbook ensures efficiency from day one."
    },
    {
      icon: <ShieldCheck className="w-8 h-8 text-gold" />,
      title: "Brand Authority",
      description: "Leverage the DemoShop name. We are synonymous with quality, precision, and the modern gentleman's lifestyle."
    },
    {
      icon: <Users className="w-8 h-8 text-gold" />,
      title: "Comprehensive Training",
      description: "We don't just hand you a manual. We train your barbers and managers at our HQ to ensure the DemoShop standard."
    },
    {
      icon: <Building className="w-8 h-8 text-gold" />,
      title: "Site Selection Support",
      description: "Our real estate team helps you identify, negotiate, and build out the perfect location for your branch."
    }
  ];

  return (
    <div className="min-h-screen bg-charcoal pt-24 pb-12 relative">
      {/* Background Texture */}
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      {/* Hero Section */}
      <div className="relative h-[70vh] flex items-center justify-center overflow-hidden mb-20">
        <div className="absolute inset-0 bg-charcoal/80 z-10"></div>
        <img 
          src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=1976&auto=format&fit=crop" 
          alt="Barbershop Interior" 
          width={1920}
          height={1080}
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover grayscale"
        />
        <div className="relative z-20 text-center px-4 max-w-4xl mx-auto animate-fade-in">
          <span className="text-gold font-serif italic text-xl mb-4 block">Business Opportunity</span>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-ivory mb-6 tracking-tight">
            OWN A <span className="text-gold">LEGACY</span>
          </h1>
          <p className="text-ivory-dim text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed mb-10">
            Bring the DemoShop's Barbers experience to your city. We are looking for visionary partners to expand our footprint of premium grooming.
          </p>
          <Button variant="primary" className="min-w-[200px]">
            Download Franchise Kit
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Why Partner Section */}
        <div className="mb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-ivory mb-4">Why Partner With Us?</h2>
            <div className="h-[1px] w-24 bg-gold mx-auto"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div 
                key={index} 
                className="bg-charcoal-light border border-white/5 p-8 rounded-sm hover:border-gold/30 transition-all duration-500 group animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="mb-6 p-4 bg-charcoal rounded-full w-fit group-hover:scale-110 transition-transform duration-300 border border-white/5 group-hover:border-gold/20">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-serif font-bold text-ivory mb-3">{benefit.title}</h3>
                <p className="text-ivory-dim text-sm font-light leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Investment Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-32">
          <div className="order-2 lg:order-1">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-ivory mb-6">Investment & Requirements</h2>
            <p className="text-ivory-dim mb-8 leading-relaxed">
              We maintain high standards to ensure the success of every branch. Prospective franchisees should meet the following criteria:
            </p>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-4">
                <div className="w-2 h-2 bg-gold rounded-full mt-2 shrink-0"></div>
                <div>
                  <span className="block text-ivory font-bold">Liquid Capital</span>
                  <span className="text-ivory-dim text-sm">Minimum of ₱2,000,000</span>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="w-2 h-2 bg-gold rounded-full mt-2 shrink-0"></div>
                <div>
                  <span className="block text-ivory font-bold">Net Worth</span>
                  <span className="text-ivory-dim text-sm">Minimum of ₱5,000,000</span>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="w-2 h-2 bg-gold rounded-full mt-2 shrink-0"></div>
                <div>
                  <span className="block text-ivory font-bold">Experience</span>
                  <span className="text-ivory-dim text-sm">Business management or retail experience preferred.</span>
                </div>
              </li>
            </ul>
          </div>
          <div className="order-1 lg:order-2 relative">
            <div className="absolute inset-0 bg-gold/20 transform translate-x-4 translate-y-4 border border-gold/30"></div>
            <img 
              src="https://images.unsplash.com/photo-1503951914875-befbb6470523?q=80&w=2068&auto=format&fit=crop" 
              alt="Investment" 
              width={1024}
              height={683}
              loading="lazy"
              decoding="async"
              className="relative z-10 w-full h-auto aspect-[3/2] grayscale hover:grayscale-0 transition-all duration-700"
            />
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-charcoal-light border border-white/5 p-12 rounded-sm text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl font-serif font-bold text-ivory mb-4">Ready to Start?</h2>
            <p className="text-ivory-dim mb-8">
              Take the first step towards owning your own DemoShop's Barbershop. Fill out our inquiry form and our development team will be in touch.
            </p>
            <form className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Full Name" className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none" />
                <input type="email" placeholder="Email Address" className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none" />
              </div>
              <input type="tel" placeholder="Phone Number" className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none" />
              <textarea rows={4} placeholder="Tell us about your business background..." className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none resize-none"></textarea>
              <Button variant="primary" className="w-full justify-center">Submit Inquiry</Button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};
