import { useEffect } from 'react';
import { useLocation } from 'react-router';

type SeoConfig = {
  title: string;
  description: string;
  indexable: boolean;
};

const SITE_URL = 'https://portfolio.example.invalid';
const ROUTE_SEO: Record<string, SeoConfig> = {
  '/': {
    title: 'DemoShop Barbershop | SampleBranch SJDM, Bulacan',
    description:
      'Looking for a barbershop in Bulacan or SJDM? Book a haircut at DemoShop Barbershop in SampleBranch, San Jose del Monte, Bulacan.',
    indexable: true,
  },
  '/branches': {
    title: 'SampleBranch Barbershop in San Jose del Monte | DemoShop',
    description:
      'Find DemoShop Barbershop, a local SJDM barbershop at SampleBranch, Brgy. Kaypian, San Jose del Monte, Bulacan. See hours, directions, and booking options.',
    indexable: true,
  },
  '/careers': {
    title: 'Barber Jobs and Careers | DemoShop Barbershop',
    description:
      'Explore barber and team opportunities at DemoShop Barbershop’s SampleBranch branch in San Jose del Monte, Bulacan.',
    indexable: true,
  },
  '/franchise': {
    title: 'Barbershop Franchise Inquiry | DemoShop Barbershop',
    description:
      'Send a franchise inquiry to DemoShop Barbershop and learn more about bringing our grooming experience to a new location.',
    indexable: true,
  },
  '/booking': {
    title: 'Book a Haircut | DemoShop Barbershop SampleBranch',
    description:
      'Check availability and request your next grooming session at DemoShop Barbershop SampleBranch in San Jose del Monte, Bulacan.',
    indexable: false,
  },
  '/shop': {
    title: 'Shop Grooming Products | DemoShop Barbershop',
    description: 'Browse grooming products from DemoShop Barbershop.',
    indexable: false,
  },
};

const PRIVATE_ROUTE_PREFIXES = [
  '/admin',
  '/barber',
  '/cashier',
  '/dashboard',
  '/docs',
  '/forgot-password',
  '/guest-overview',
  '/inventory-manager',
  '/login',
  '/register',
  '/system-admin',
  '/verify-email',
];

const LEGAL_ROUTE_PREFIXES = ['/documents/', '/privacy', '/terms'];

const getSeoConfig = (pathname: string): SeoConfig => {
  const exactConfig = ROUTE_SEO[pathname];
  if (exactConfig) return exactConfig;

  if (
    PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    LEGAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
  ) {
    return {
      title: 'DemoShop Barbershop',
      description: 'DemoShop Barbershop customer and business services.',
      indexable: false,
    };
  }

  return {
    title: 'DemoShop Barbershop | SampleBranch SJDM, Bulacan',
    description:
      'DemoShop Barbershop at SampleBranch, San Jose del Monte, Bulacan. Book your next haircut with a local SJDM barber and experience classic grooming with a modern edge.',
    indexable: false,
  };
};

const setMetaContent = (selector: string, content: string) => {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
};

export const SeoHead = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const config = getSeoConfig(pathname);
    const canonicalUrl = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
    const robots = config.indexable ? 'index, follow' : 'noindex, nofollow';

    document.title = config.title;
    setMetaContent('meta[name="description"]', config.description);
    setMetaContent('meta[name="robots"]', robots);
    setMetaContent('meta[property="og:title"]', config.title);
    setMetaContent('meta[property="og:description"]', config.description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[name="twitter:title"]', config.title);
    setMetaContent('meta[name="twitter:description"]', config.description);

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      canonical.href = canonicalUrl;
      canonical.setAttribute('data-seo-managed', 'true');
    }
  }, [pathname]);

  return null;
};
