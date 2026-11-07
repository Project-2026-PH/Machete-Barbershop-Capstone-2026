import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Scissors } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  tr: number;
  delay: number;
  length: number;
}

interface ClickScissor {
  id: number;
  x: number;
  y: number;
}

export const NotFound: React.FC = () => {
  const [quote, setQuote] = useState('');
  const [cut, setCut] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [clickScissors, setClickScissors] = useState<ClickScissor[]>([]);
  
  const particleIdRef = useRef(0);
  const scissorIdRef = useRef(0);

  const quotes = [
    "Invest in your hair, it is the crown you never take off.",
    "Style is a way to say who you are without having to speak.",
    "Grooming is the secret of real elegance.",
    "A gentleman's choice of cut says everything.",
    "Simplicity is the ultimate sophistication.",
    "Good hair speaks louder than words."
  ];

  useEffect(() => {
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    
    // Looping cut animation
    const interval = setInterval(() => {
      setCut(true);
      setIsShaking(true);
      
      // Stop shaking shortly after cut
      setTimeout(() => setIsShaking(false), 500);
      // Reset cut state to restart loop
      setTimeout(() => setCut(false), 2500);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent trigger when clicking button/links
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
      return;
    }

    const x = e.clientX;
    const y = e.clientY;

    // Spawn clicking scissors
    const newScissorId = scissorIdRef.current++;
    setClickScissors(prev => [...prev, { id: newScissorId, x, y }]);
    setTimeout(() => {
      setClickScissors(prev => prev.filter(s => s.id !== newScissorId));
    }, 800);

    // Spawn hair particles
    const newParticles: Particle[] = [];
    const count = 8 + Math.floor(Math.random() * 6); // 8-14 strands
    
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x,
        y,
        tx: (Math.random() - 0.5) * 160, // drift left/right
        ty: 150 + Math.random() * 200,   // fall down
        tr: (Math.random() - 0.5) * 720, // rotation
        delay: Math.random() * 0.15,
        length: 8 + Math.random() * 14   // random strand length
      });
    }

    setParticles(prev => [...prev, ...newParticles]);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);

    // Clean up particles
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 2000);
  };

  return (
    <div 
      onClick={handleScreenClick}
      className="min-h-screen bg-charcoal flex flex-col items-center justify-center relative overflow-hidden text-center px-4 cursor-cell select-none"
    >
      <style>{`
        @keyframes hair-sway-a {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(1.2deg); }
        }
        @keyframes hair-sway-b {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-1.5deg); }
        }
        @keyframes hair-sway-c {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(0.8deg); }
        }
        
        .hair-strand-1 { animation: hair-sway-a 4s ease-in-out infinite; }
        .hair-strand-2 { animation: hair-sway-b 5.2s ease-in-out infinite; }
        .hair-strand-3 { animation: hair-sway-c 4.7s ease-in-out infinite; }

        @keyframes card-shake {
          0%, 100% { transform: translate(0, 0); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-2px, 1px); }
          20%, 40%, 60%, 80% { transform: translate(2px, -1px); }
        }
        .animate-shake {
          animation: card-shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }

        @keyframes scissor-snip {
          0%, 100% { transform: rotate(0deg) scale(1); }
          30% { transform: rotate(-25deg) scale(1.1); }
          50% { transform: rotate(5deg) scale(1); }
          75% { transform: rotate(-15deg) scale(1.05); }
        }
        .animate-scissor-snip {
          animation: scissor-snip 0.45s ease-in-out;
        }

        @keyframes rapid-snip {
          0%, 100% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(-20deg) scale(1.05); }
        }
        .animate-rapid-snip {
          animation: rapid-snip 0.15s ease-in-out infinite;
        }

        @keyframes particle-fall {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--tx), var(--ty), 0) rotate(var(--tr));
          }
        }
        .hair-particle {
          animation: particle-fall 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }

        @keyframes line-glow {
          0%, 100% { filter: drop-shadow(0 0 1px rgba(212,175,55,0.3)); }
          50% { filter: drop-shadow(0 0 3px rgba(212,175,55,0.7)); }
        }
        .glow-hair {
          animation: line-glow 3s ease-in-out infinite;
        }
      `}</style>

      {/* Background Texture */}
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      {/* Dynamic Swaying & Falling Hair Strands */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-32 pointer-events-none z-0 flex justify-center">
        {/* Strand 1 (Left) */}
        <div className="hair-strand-1 origin-top absolute left-8 flex flex-col items-center">
          <div className="w-[1.5px] h-[32vh] bg-gradient-to-b from-transparent via-gold/40 to-gold/90 glow-hair"></div>
          <div 
            className={`w-[1.5px] h-[35vh] bg-gradient-to-b from-gold/90 to-transparent origin-top transition-all duration-[1200ms] ease-in-out ${
              cut ? 'translate-y-[100vh] -rotate-12 opacity-0' : 'translate-y-0 rotate-0 opacity-40'
            }`}
          ></div>
        </div>

        {/* Strand 2 (Center) */}
        <div className="hair-strand-2 origin-top absolute left-16 flex flex-col items-center">
          <div className="w-[1.5px] h-[30vh] bg-gradient-to-b from-transparent via-gold/50 to-gold glow-hair"></div>
          <div 
            className={`w-[1.5px] h-[38vh] bg-gradient-to-b from-gold to-transparent origin-top transition-all duration-[1000ms] ease-in ${
              cut ? 'translate-y-[100vh] rotate-6 opacity-0' : 'translate-y-0 rotate-0 opacity-50'
            }`}
          ></div>
        </div>

        {/* Strand 3 (Right) */}
        <div className="hair-strand-3 origin-top absolute left-24 flex flex-col items-center">
          <div className="w-[1.5px] h-[34vh] bg-gradient-to-b from-transparent via-gold/30 to-gold/80 glow-hair"></div>
          <div 
            className={`w-[1.5px] h-[32vh] bg-gradient-to-b from-gold/80 to-transparent origin-top transition-all duration-[1400ms] ease-out ${
              cut ? 'translate-y-[100vh] rotate-[18deg] opacity-0' : 'translate-y-0 rotate-0 opacity-30'
            }`}
          ></div>
        </div>

        {/* Central Scissors */}
        <div 
          className="absolute top-[30vh] -translate-y-1/2 z-10 w-16 h-16 flex items-center justify-center transition-all duration-300"
          style={{
            transform: `translateY(-50%) ${buttonHovered ? 'scale(1.2)' : 'scale(1)'}`,
            filter: buttonHovered ? 'drop-shadow(0 0 8px rgba(212,175,55,0.6))' : 'none'
          }}
        >
          <Scissors 
            className={`text-gold w-9 h-9 transition-all duration-300 ${
              cut ? 'opacity-100 animate-scissor-snip' : buttonHovered ? 'opacity-100 animate-rapid-snip' : 'opacity-40 scale-95'
            }`} 
          />
        </div>
      </div>

      {/* Clicking Scissors Spawner */}
      {clickScissors.map(sc => (
        <div 
          key={sc.id}
          className="absolute pointer-events-none z-50 text-gold flex items-center justify-center animate-scissor-snip"
          style={{
            left: sc.x - 24,
            top: sc.y - 24,
            width: 48,
            height: 48,
            filter: 'drop-shadow(0 2px 8px rgba(212,175,55,0.5))'
          }}
        >
          <Scissors className="w-8 h-8" />
        </div>
      ))}

      {/* Floating Hair Snippet Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="hair-particle absolute pointer-events-none bg-gradient-to-b from-gold to-transparent"
          style={{
            left: p.x,
            top: p.y,
            width: '1.5px',
            height: `${p.length}px`,
            opacity: 0.8,
            animationDelay: `${p.delay}s`,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--tr': `${p.tr}deg`,
          } as React.CSSProperties}
        ></div>
      ))}

      {/* Core Page Card */}
      <div 
        className={`relative z-10 mt-10 transition-transform duration-300 ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        <h1 className="text-[8rem] md:text-[12rem] font-serif font-black text-transparent bg-clip-text bg-gradient-to-b from-gold via-gold/80 to-charcoal mb-0 tracking-tighter leading-none select-none drop-shadow-2xl">
          404
        </h1>
        
        <div className="relative h-px w-24 bg-gold/20 mx-auto mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-gold w-full animate-[cut-progress_2s_ease-in-out_infinite]"></div>
        </div>
        
        <h2 className="text-2xl md:text-3xl font-serif text-ivory mb-6 tracking-wide">
          Page Trimmed Off
        </h2>
        
        <p className="text-gold font-serif italic text-lg md:text-xl max-w-lg mx-auto mb-12 opacity-90 leading-relaxed transition-all duration-300">
          "{quote}"
        </p>
        
        <a 
          href="/"
          onMouseEnter={() => setButtonHovered(true)}
          onMouseLeave={() => setButtonHovered(false)}
        >
          <Button variant="primary" className="min-w-[200px] hover:scale-105 transition-all duration-300">
            Return
          </Button>
        </a>
      </div>

      {/* Footer Copyright */}
      <div className="absolute bottom-8 text-ivory-dim/30 text-xs tracking-widest font-serif pointer-events-none">
        DEMOSHOP'S BARBERS &copy; EST. 2024
      </div>
    </div>
  );
};
