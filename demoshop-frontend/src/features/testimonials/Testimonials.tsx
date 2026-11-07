import React, { useState, useEffect } from 'react';
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react';

export const Testimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const testimonials = [
    {
      id: 1,
      name: "Juan dela Cruz",
      role: "Business Owner",
      text: "Solid ang gupit dito! The attention to detail is unmatched. Parang ritual ang bawat gupit, nakaka-relax talaga.",
      rating: 5
    },
    {
      id: 2,
      name: "Miguel Santos",
      role: "Architect",
      text: "Finally, a place that understands the balance between classic style and modern precision. Dito na ako bago mag-client meeting.",
      rating: 5
    },
    {
      id: 3,
      name: "David Tan",
      role: "Entrepreneur",
      text: "Impeccable service from the moment you walk in. Sulit ang hot towel shave. Best barbershop in the metro, hands down.",
      rating: 5
    },
    {
      id: 4,
      name: "Alex Reyes",
      role: "Creative Director",
      text: "A sanctuary for the modern gentleman. The staff are true artisans who take pride in their craft. Di ako magpapagupit sa iba.",
      rating: 5
    }
  ];

  // Auto-shuffle logic
  useEffect(() => {
    const interval = setInterval(() => {
      handleNext();
    }, 6000); // Change every 6 seconds
    return () => clearInterval(interval);
  }, [currentIndex]);

  const handleNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
      setIsAnimating(false);
    }, 500); // Wait for fade out
  };

  const handlePrev = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
      setIsAnimating(false);
    }, 500);
  };

  const current = testimonials[currentIndex];

  return (
    <section className="py-24 bg-charcoal-light bg-texture relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-gold font-serif italic text-lg mb-2 block animate-fade-in">Client Stories</span>
          <div className="h-[1px] w-12 bg-gold mx-auto opacity-50"></div>
        </div>

        {/* Minimal Slider Container */}
        <div className="relative min-h-[300px] flex flex-col items-center justify-center text-center">
          
          {/* Background Quote */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
            <Quote size={200} className="text-gold fill-gold" />
          </div>

          {/* Content */}
          <div 
            className={`transition-all duration-500 transform ${isAnimating ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}
          >
            {/* Stars */}
            <div className="flex justify-center gap-1 mb-8">
              {[...Array(current.rating)].map((_, i) => (
                <Star key={i} className="w-4 h-4 text-gold fill-gold" />
              ))}
            </div>

            {/* Quote Text */}
            <h3 className="text-2xl md:text-4xl font-serif font-light text-ivory leading-relaxed mb-10 max-w-3xl mx-auto">
              "{current.text}"
            </h3>

            {/* Author Info */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center text-gold font-serif font-bold text-lg border border-gold/20 mb-2">
                {current.name.charAt(0)}
              </div>
              <div>
                <h4 className="text-ivory font-bold font-serif tracking-wide text-lg">{current.name}</h4>
                <span className="text-gold/60 text-xs uppercase tracking-widest">{current.role}</span>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full flex justify-between pointer-events-none px-4 md:px-0">
            <button 
              onClick={handlePrev}
              className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center text-ivory/50 hover:text-gold hover:border-gold transition-all duration-300 pointer-events-auto hover:scale-110 backdrop-blur-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={handleNext}
              className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center text-ivory/50 hover:text-gold hover:border-gold transition-all duration-300 pointer-events-auto hover:scale-110 backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Dots */}
          <div className="absolute -bottom-12 flex gap-3">
            {testimonials.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (isAnimating || idx === currentIndex) return;
                  setIsAnimating(true);
                  setTimeout(() => {
                    setCurrentIndex(idx);
                    setIsAnimating(false);
                  }, 500);
                }}
                className="min-w-8 min-h-8 flex items-center justify-center rounded-full transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                aria-label={`Go to testimonial ${idx + 1}`}
              >
                <span className={`block h-1 rounded-full transition-all duration-500 ${idx === currentIndex ? 'w-8 bg-gold' : 'w-2 bg-white/10 hover:bg-white/30'}`} />
              </button>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
};
