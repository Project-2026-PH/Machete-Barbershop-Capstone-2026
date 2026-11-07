import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link, useLocation } from 'react-router';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Services', href: '/#services' },
    { name: 'Collections', href: '/#shop' },
    { name: 'Gallery', href: '/#gallery' },
    { name: 'Branches', href: '/#locations' },
    { name: 'About', href: '/#about' },
  ];

  const handleNavLinkClick = (e: React.MouseEvent, href: string) => {
    if (href === '/') {
      if (location.pathname === '/') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.location.hash) {
          window.history.pushState(null, '', '/');
        }
      }
    } else if (href.startsWith('/#')) {
      if (location.pathname === '/') {
        e.preventDefault();
        const targetId = href.substring(2); // Remove '/#'
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          window.history.pushState(null, '', href);
        }
      }
    }
  };

  // If we are on login/register page, show a simplified navbar or just the logo
  if (isAuthPage) {
    return (
      <nav className="fixed w-full z-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 w-fit">
            <picture>
              <source srcSet="/demoshop_logo.webp" type="image/webp" />
              <img src="/demoshop_logo.png" alt="DemoShop Logo" width={256} height={256} decoding="async" className="h-12 w-auto" />
            </picture>
            <span className="font-serif text-2xl font-bold tracking-widest text-ivory">
              DEMOSHOP<span className="text-gold">'S</span>
            </span>
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className={`fixed w-full z-50 transition-all duration-700 ease-in-out ${scrolled ? 'bg-charcoal/95 border-b border-gold/20 py-2 backdrop-blur-md shadow-lg' : 'bg-transparent py-6'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link
            to="/"
            className="flex-shrink-0 flex items-center gap-3 group cursor-pointer"
            onClick={(e) => handleNavLinkClick(e, '/')}
          >
            <picture>
              <source srcSet="/demoshop_logo.webp" type="image/webp" />
              <img
                src="/demoshop_logo.png"
                alt="DemoShop Logo"
                width={256}
                height={256}
                decoding="async"
                className="h-12 w-auto transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
              />
            </picture>
            <span className="font-serif text-2xl font-bold tracking-widest text-ivory hidden sm:block transition-colors duration-300 group-hover:text-gold">
              DEMOSHOP<span className="text-gold group-hover:text-ivory transition-colors duration-300">'S</span>
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={(e) => handleNavLinkClick(e, link.href)}
                  className="text-ivory-dim hover:text-gold font-sans text-sm uppercase tracking-widest transition-all duration-300 relative group py-2"
                >
                  {link.name}
                  <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-gold transition-all duration-500 ease-out group-hover:w-full"></span>
                  <span className="absolute bottom-0 right-0 w-0 h-[1px] bg-gold transition-all duration-500 ease-out group-hover:w-full delay-75"></span>
                </Link>
              ))}
              <Link to="/login" className="flex-shrink-0">
                <Button variant="primary" className="ml-4 text-xs py-2 px-6 whitespace-nowrap">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-ivory hover:text-gold p-2 transition-all duration-300 hover:rotate-90"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-charcoal border-b border-gold/20 animate-fade-in">
          <div className="px-4 pt-2 pb-6 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className="text-ivory hover:text-gold hover:bg-white/5 block px-3 py-3 rounded-md text-base font-serif tracking-wider text-center border-b border-white/5 transition-all duration-300 hover:tracking-[0.15em]"
                onClick={(e) => {
                  setIsOpen(false);
                  handleNavLinkClick(e, link.href);
                }}
              >
                {link.name}
              </Link>
            ))}
            <div className="mt-6 px-3">
              <Link to="/login" onClick={() => setIsOpen(false)}>
                <Button variant="primary" className="w-full">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
