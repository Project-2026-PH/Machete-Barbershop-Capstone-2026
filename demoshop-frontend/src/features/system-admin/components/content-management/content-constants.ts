export type ContentManagementArea =
  | 'landing'
  | 'gallery'
  | 'faq'
  | 'legal'
  | 'business'
  | 'footer';

export interface ContentAreaDef {
  key: ContentManagementArea;
  label: string;
  shortDescription: string;
  iconName: 'Globe' | 'Image' | 'HelpCircle' | 'ShieldAlert' | 'Store' | 'Layers';
}

export const CONTENT_AREAS: ContentAreaDef[] = [
  {
    key: 'landing',
    label: 'Landing Page',
    shortDescription: 'Homepage sections, banner headlines, and call-to-actions',
    iconName: 'Globe',
  },
  {
    key: 'gallery',
    label: 'Gallery',
    shortDescription: 'Public portfolio imagery and showcase photo ordering',
    iconName: 'Image',
  },
  {
    key: 'faq',
    label: 'FAQ',
    shortDescription: 'Customer questions, answers, and visibility ordering',
    iconName: 'HelpCircle',
  },
  {
    key: 'legal',
    label: 'Legal & Policies',
    shortDescription: 'Terms of Service and Privacy Policy markdown documents',
    iconName: 'ShieldAlert',
  },
  {
    key: 'business',
    label: 'Business Information',
    shortDescription: 'Storefront name, physical address, and weekly operating hours',
    iconName: 'Store',
  },
  {
    key: 'footer',
    label: 'Footer & Socials',
    shortDescription: 'Brand description, social media links, and copyright notices',
    iconName: 'Layers',
  },
];

export interface LandingSectionDef {
  key: string;
  name: string;
  description: string;
  hasDedicatedEditor: boolean;
  editorArea?: ContentManagementArea;
}

export const LANDING_PAGE_SECTIONS: LandingSectionDef[] = [
  {
    key: 'hero',
    name: 'Hero Banner',
    description: 'Main storefront introduction, brand headline, background imagery, and primary CTA buttons.',
    hasDedicatedEditor: true,
  },
  {
    key: 'about',
    name: 'About & Brand Heritage',
    description: 'Store story, heritage narrative, statistics, founder quote, and showcase brand photo.',
    hasDedicatedEditor: true,
  },
  {
    key: 'services',
    name: 'Services Showcase',
    description: 'Featured haircuts, grooming treatments, and storefront service pricing catalog.',
    hasDedicatedEditor: false,
  },
  {
    key: 'bookingPreview',
    name: 'Online Booking Section',
    description: 'Interactive appointment scheduling teaser encouraging customers to join the queue.',
    hasDedicatedEditor: false,
  },
  {
    key: 'gallery',
    name: 'Showcase Gallery',
    description: 'Customer haircut portfolio, barbershop aesthetic, and visual haircut showcase.',
    hasDedicatedEditor: true,
    editorArea: 'gallery',
  },
  {
    key: 'locations',
    name: 'Branch Locations',
    description: 'Physical barber branches, opening schedules, contact numbers, and Google Maps directions.',
    hasDedicatedEditor: false,
  },
  {
    key: 'testimonials',
    name: 'Customer Reviews',
    description: 'Social proof, client feedback, and community ratings from verified customers.',
    hasDedicatedEditor: false,
  },
  {
    key: 'faq',
    name: 'FAQ Accordion',
    description: 'Frequently asked customer questions regarding booking, payments, and appointments.',
    hasDedicatedEditor: true,
    editorArea: 'faq',
  },
  {
    key: 'footer',
    name: 'Footer & Navigation',
    description: 'Storefront footer links, social media channels, and copyright disclaimer.',
    hasDedicatedEditor: true,
    editorArea: 'footer',
  },
];
