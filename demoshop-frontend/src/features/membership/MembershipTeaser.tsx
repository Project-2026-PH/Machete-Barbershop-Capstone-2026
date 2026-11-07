import React from 'react';
import { Crown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';

export const MembershipTeaser = () => {
  return (
    <section className="py-32 bg-charcoal-light relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Content */}
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <Crown className="w-6 h-6 text-gold" />
              <span className="text-gold font-serif italic text-xl">The DemoShop Club</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-serif font-bold text-ivory mb-6 leading-tight">
              ELEVATE YOUR <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold to-yellow-200">GROOMING RITUAL</span>
            </h2>
            <p className="text-ivory-dim text-lg mb-8 font-light leading-relaxed">
              Join our exclusive membership program and unlock a world of privileges. From priority booking to complimentary services, experience the true meaning of VIP.
            </p>
            
            <div className="space-y-4 mb-10">
              {[
                "Priority Booking Access",
                "10% Off All Products",
                "Complimentary Beverage Upgrade",
                "Birthday Service on the House"
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-gold" />
                  </div>
                  <span className="text-ivory">{benefit}</span>
                </div>
              ))}
            </div>

            <Link to="/register">
              <Button variant="primary" className="min-w-[200px]">
                Become a Member
              </Button>
            </Link>
          </div>

          {/* Card Visual */}
          <div className="relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="relative z-10 w-full aspect-[1.58/1] bg-gradient-to-br from-charcoal to-black border border-gold/30 rounded-xl p-8 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-700 group">
              {/* Card Texture */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-gold/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-20 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <img src="/demoshop_logo.png" alt="Logo" width={192} height={48} loading="lazy" decoding="async" className="h-12 w-auto opacity-80" />
                  <Crown className="w-8 h-8 text-gold" />
                </div>
                
                <div>
                  <div className="text-gold/50 text-xs uppercase tracking-[0.2em] mb-2">Gold Member</div>
                  <div className="text-2xl font-mono text-ivory tracking-widest group-hover:text-gold transition-colors">
                    0000 1234 5678 9000
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[10px] text-ivory-dim uppercase tracking-widest mb-1">Member Name</div>
                    <div className="text-sm font-bold text-ivory">JUAN DELA CRUZ</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-ivory-dim uppercase tracking-widest mb-1">Valid Thru</div>
                    <div className="text-sm font-bold text-ivory">12/25</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Shadow Element */}
            <div className="absolute inset-0 bg-gold/20 blur-3xl -z-10 transform translate-y-10 scale-90"></div>
          </div>

        </div>
      </div>
    </section>
  );
};
