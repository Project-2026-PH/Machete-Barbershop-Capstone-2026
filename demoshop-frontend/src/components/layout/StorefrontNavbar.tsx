import React from 'react';
import { Scissors } from 'lucide-react';

export interface StorefrontNavbarProps {
  onNavigate?: (anchor: string) => void;
  isPreviewMode?: boolean;
}

export function StorefrontNavbar({ onNavigate, isPreviewMode = false }: StorefrontNavbarProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, anchor: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(anchor);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">

        {/* 1. Left: Brand Logo & Crest (Strictly isolated with shrink-0) */}
        <div
          onClick={(e) => {
            if (onNavigate) {
              e.preventDefault();
              onNavigate('home');
            }
          }}
          className={`flex shrink-0 items-center gap-3 ${onNavigate ? 'cursor-pointer' : ''}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400 shadow-sm shadow-amber-400/5">
            <Scissors className="h-4 w-4 rotate-45" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg font-bold tracking-[0.2em] text-zinc-100 uppercase">
              DEMOSHOP<span className="text-amber-400">'S</span>
            </span>
            <span className="text-[9px] font-semibold tracking-[0.3em] text-zinc-400 uppercase">
              BARBERSHOP
            </span>
          </div>
        </div>

        {/* 2. Center: Navigation Links (Centered and decoupled from logo) */}
        <nav className="hidden md:flex items-center justify-center gap-6 lg:gap-8 flex-1 px-8">
          <a
            href="#home"
            onClick={(e) => handleClick(e, 'home')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            HOME
          </a>
          <a
            href="#services"
            onClick={(e) => handleClick(e, 'services')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            SERVICES
          </a>
          <a
            href="#shop"
            onClick={(e) => handleClick(e, 'shop')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            COLLECTIONS
          </a>
          <a
            href="#gallery"
            onClick={(e) => handleClick(e, 'gallery')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            GALLERY
          </a>
          <a
            href="#branches"
            onClick={(e) => handleClick(e, 'locations')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            BRANCHES
          </a>
          <a
            href="#about"
            onClick={(e) => handleClick(e, 'about')}
            className="text-xs font-semibold tracking-widest text-zinc-300 uppercase transition hover:text-amber-400 cursor-pointer"
          >
            ABOUT
          </a>
        </nav>

        {/* 3. Right: Action Buttons (whitespace-nowrap prevents line wrapping) */}
        <div className="flex shrink-0 items-center justify-end">
          <a
            href="/login"
            onClick={(e) => {
              if (isPreviewMode) {
                e.preventDefault();
              }
            }}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-amber-400/80 bg-transparent px-6 py-2 text-xs font-bold tracking-widest text-amber-400 uppercase shadow-sm transition hover:bg-amber-400 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer"
          >
            SIGN IN
          </a>
        </div>

      </div>
    </header>
  );
}

export default StorefrontNavbar;
