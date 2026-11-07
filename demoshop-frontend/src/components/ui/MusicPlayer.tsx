import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

export const MusicPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Jazz / Lo-fi track for barbershop ambiance
  const trackUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3"; 

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.log("Play prevented:", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="fixed bottom-8 left-8 z-40 hidden md:flex items-center gap-4 animate-fade-in">
      <audio ref={audioRef} src={trackUrl} loop preload="none" />
      
      {/* Visualizer Bars (Animated when playing) */}
      <div className="flex items-end gap-1 h-8">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i}
            className={`w-1 bg-gold transition-all duration-300 ${isPlaying ? 'animate-[music-bar_1s_ease-in-out_infinite]' : 'h-1'}`}
            style={{ 
              height: isPlaying ? '100%' : '4px',
              animationDelay: `${i * 0.1}s` 
            }}
          ></div>
        ))}
      </div>

      {/* Controls Container */}
      <div className="bg-charcoal/80 backdrop-blur-md border border-white/10 rounded-full p-2 flex items-center gap-2 pr-4 hover:border-gold/30 transition-colors group">
        
        {/* Play/Pause Button */}
        <button 
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-gold text-charcoal flex items-center justify-center hover:scale-110 transition-transform"
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>

        {/* Track Info */}
        <div className="flex flex-col">
          <span className="text-[10px] text-gold font-bold uppercase tracking-widest">Now Playing</span>
          <span className="text-xs text-ivory font-serif italic">Late Night Jazz</span>
        </div>

        {/* Volume Control (Hidden by default, shown on hover) */}
        <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300 flex items-center gap-2 ml-2">
          <button onClick={toggleMute} className="text-ivory-dim hover:text-gold">
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-gold [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      </div>
    </div>
  );
};
