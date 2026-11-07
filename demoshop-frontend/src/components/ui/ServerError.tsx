import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Scissors } from 'lucide-react';

export const ServerError: React.FC = () => {
    const [quote, setQuote] = useState('');
    const [cut, setCut] = useState(false);

    const quotes = [
        "Even the best blades need sharpening sometimes.",
        "We're sweeping up the shop. Back shortly.",
        "Quality takes time. We're fixing the details.",
        "A clean shop is a happy shop. Maintenance in progress.",
        "Sharpening our skills and our servers."
    ];

    useEffect(() => {
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

        // Trigger cut animation loop
        const interval = setInterval(() => {
            setCut(true);
            setTimeout(() => setCut(false), 2500); // Reset after fall animation completes
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-charcoal flex flex-col items-center justify-center relative overflow-hidden text-center px-4">
            {/* Background Texture */}
            <div className="absolute inset-0 bg-texture opacity-50"></div>

            {/* Hair Cutting Animation */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-20 pointer-events-none z-0 flex flex-col items-center">
                {/* Top part of hair (Fixed) */}
                <div className="w-[1px] h-[30vh] bg-gradient-to-b from-transparent via-gold/50 to-gold"></div>

                {/* Scissors Container */}
                <div className="relative w-12 h-12 flex items-center justify-center -my-3 z-10">
                    <Scissors
                        className={`text-gold w-8 h-8 transition-all duration-300 ${cut ? 'opacity-100 scale-100 animate-[snip_0.3s_ease-in-out]' : 'opacity-0 scale-50'}`}
                    />
                </div>

                {/* Bottom part of hair (Falls) */}
                <div
                    className={`w-[1px] h-[20vh] bg-gradient-to-b from-gold to-transparent origin-top transition-all duration-1000 ease-in ${cut ? 'translate-y-[100vh] rotate-6 opacity-0' : 'translate-y-0 rotate-0 opacity-50'}`}
                ></div>
            </div>

            <div className="relative z-10 animate-fade-in mt-10">
                <h1 className="text-[8rem] md:text-[12rem] font-serif font-black text-transparent bg-clip-text bg-gradient-to-b from-gold via-gold/80 to-charcoal mb-0 tracking-tighter leading-none select-none drop-shadow-2xl">
                    500
                </h1>

                <div className="relative h-px w-24 bg-gold/20 mx-auto mb-8 overflow-hidden">
                    <div className="absolute inset-0 bg-gold w-full animate-[cut-progress_2s_ease-in-out_infinite]"></div>
                </div>

                <h2 className="text-2xl md:text-3xl font-serif text-ivory mb-6 tracking-wide">
                    Internal Service Error
                </h2>

                <p className="text-gold font-serif italic text-lg md:text-xl max-w-lg mx-auto mb-12 opacity-90 leading-relaxed">
                    "{quote}"
                </p>

                <div className="flex gap-4 justify-center">
                    <Button
                        variant="outline"
                        className="min-w-[150px]"
                        onClick={() => window.location.reload()}
                    >
                        Try Again
                    </Button>
                    <a href="/">
                        <Button variant="primary" className="min-w-[150px]">
                            Return to Salon
                        </Button>
                    </a>
                </div>
            </div>

            {/* Footer Copyright */}
            <div className="absolute bottom-8 text-ivory-dim/30 text-xs tracking-widest font-serif">
                DEMOSHOP'S BARBERS &copy; EST. 2024
            </div>
        </div>
    );
};
