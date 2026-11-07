import React from 'react';
import { Button } from '@/components/ui/Button';
import { Scissors, TrendingUp, Users, Award } from 'lucide-react';

export const Careers = () => {
  const benefits = [
    {
      icon: <Scissors className="w-8 h-8 text-gold" />,
      title: "Mastery & Growth",
      description: "Access to exclusive workshops and masterclasses from world-renowned barbers."
    },
    {
      icon: <TrendingUp className="w-8 h-8 text-gold" />,
      title: "High Earning Potential",
      description: "Competitive commission rates, tips, and performance bonuses."
    },
    {
      icon: <Users className="w-8 h-8 text-gold" />,
      title: "Premium Clientele",
      description: "Work with a distinguished client base in a professional, high-end environment."
    },
    {
      icon: <Award className="w-8 h-8 text-gold" />,
      title: "Recognition",
      description: "Annual awards, features on our social platforms, and career advancement paths."
    }
  ];

  const positions = [
    {
      title: "Senior Barber",
      location: "BGC Flagship",
      type: "Full-time",
      description: "We are looking for a master of the craft with 5+ years of experience in classic cuts and straight razor shaves."
    },
    {
      title: "Shop Manager",
      location: "Makati Central",
      type: "Full-time",
      description: "Lead the daily operations of our busiest branch. Must have experience in luxury retail or hospitality management."
    },
    {
      title: "Junior Barber",
      location: "Quezon City",
      type: "Apprenticeship",
      description: "A mentorship program for promising talent. Learn the DemoShop way from the ground up."
    }
  ];

  return (
    <div className="min-h-screen bg-charcoal pt-24 pb-12 relative">
      {/* Background Texture */}
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      {/* Hero Section */}
      <div className="relative h-[60vh] flex items-center justify-center overflow-hidden mb-20">
        <div className="absolute inset-0 bg-charcoal/80 z-10"></div>
        <img 
          src="https://images.unsplash.com/photo-1503951914875-befbb6470523?q=80&w=2068&auto=format&fit=crop" 
          alt="Barber working" 
          className="absolute inset-0 w-full h-full object-cover grayscale"
        />
        <div className="relative z-20 text-center px-4 max-w-4xl mx-auto animate-fade-in">
          <span className="text-gold font-serif italic text-xl mb-4 block">Join the Elite</span>
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-ivory mb-6 tracking-tight">
            CRAFT YOUR <span className="text-gold">LEGACY</span>
          </h1>
          <p className="text-ivory-dim text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed">
            DemoShop's is not just a barbershop; it's a collective of artists dedicated to the pursuit of perfection. Are you ready to elevate your career?
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-32">
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

        {/* Open Positions */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-ivory mb-4">Open Positions</h2>
            <div className="h-[1px] w-24 bg-gold mx-auto"></div>
          </div>

          <div className="space-y-6">
            {positions.map((job, index) => (
              <div 
                key={index}
                className="bg-charcoal-light border border-white/5 p-8 rounded-sm hover:border-gold/30 transition-all duration-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group"
              >
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-2xl font-serif font-bold text-ivory group-hover:text-gold transition-colors">{job.title}</h3>
                    <span className="px-3 py-1 bg-white/5 text-xs uppercase tracking-widest text-ivory-dim rounded-full border border-white/10">
                      {job.type}
                    </span>
                  </div>
                  <p className="text-gold text-sm uppercase tracking-widest mb-3">{job.location}</p>
                  <p className="text-ivory-dim text-sm font-light max-w-xl">
                    {job.description}
                  </p>
                </div>
                <Button variant="outline" className="shrink-0">
                  Apply Now
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center bg-gold/5 border border-gold/20 p-12 rounded-sm">
            <h3 className="text-2xl font-serif font-bold text-ivory mb-4">Don't see your role?</h3>
            <p className="text-ivory-dim mb-8 max-w-lg mx-auto">
              We are always looking for exceptional talent. Send your portfolio and resume to <span className="text-gold">portfolio@example.invalid</span>
            </p>
            <Button variant="primary">
              Email Us
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};
