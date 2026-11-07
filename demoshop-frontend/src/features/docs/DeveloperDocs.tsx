import React, { useState } from 'react';
import { Terminal, Folder, Layers, Palette, Code, Cpu, Type, MousePointer, Search as SearchIcon, MessageSquare, Box } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';
import { FeedbackModal } from '../customer/components/FeedbackModal';


interface SectionProps {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, title, icon: Icon, children }) => (
  <section id={id} className="scroll-mt-32">
    <div className="flex items-center gap-3 mb-6">
      <Icon className="w-6 h-6 text-gold" />
      <h2 className="text-2xl font-serif font-bold text-ivory">{title}</h2>
    </div>
    {children}
  </section>
);

interface CodeBlockProps {
  children: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ children }) => (
  <div className="bg-black/30 p-4 rounded border border-white/5 font-mono text-xs text-gold overflow-x-auto">
    <pre>{children}</pre>
  </div>
);

export const DeveloperDocs = () => {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const dummyQueueItem = { id: 999, status: 'serving' };
  const dummyBarber = { name: 'Antonio DemoShop', specialty: 'Master Barber' };
  const dummyService = { name: 'Premium Haircut & Beard Trim', price: '₱1,200' };


  return (
    <div className="min-h-screen bg-charcoal pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 bg-texture opacity-50 pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="mb-16 border-b border-white/10 pb-8">
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-ivory mb-4">
            Developer <span className="text-gold">Documentation</span>
          </h1>
          <p className="text-ivory-dim text-lg">
            Technical guide, architecture overview, and style system for DemoShop's Barbers Frontend.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-xs font-mono text-gold">
            <span className="bg-gold/10 px-3 py-1 rounded border border-gold/20">v1.0.0</span>
            <span className="bg-gold/10 px-3 py-1 rounded border border-gold/20">React 19</span>
            <span className="bg-gold/10 px-3 py-1 rounded border border-gold/20">Tailwind v4</span>
            <span className="text-ivory-dim ml-auto">Last Updated: February 11, 2026</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1">
            <nav className="sticky top-32 space-y-1">
              {['Overview', 'Tech Stack', 'Structure', 'Typography', 'Components', 'Feedback', 'Theming'].map((item) => (
                <a 
                  key={item}
                  href={`#${item.toLowerCase().replace(' ', '-')}`} 
                  className="block px-4 py-2 text-ivory hover:text-gold hover:bg-white/5 rounded-sm transition-colors"
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>

          <div className="lg:col-span-3 space-y-16">
            
            <Section id="overview" title="Overview" icon={Terminal}>
              <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm text-ivory-dim font-light leading-relaxed">
                <p className="mb-4">
                  This project is the frontend client for <strong>DemoShop's Barbers</strong>, a premium barbershop management system. It is built as a Single Page Application (SPA) focusing on high-end aesthetics, smooth animations, and a seamless user experience.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                  <div className="p-4 bg-white/5 rounded-sm border border-white/10">
                    <span className="block text-xs text-gold uppercase tracking-widest mb-1">Author</span>
                    <span className="text-ivory font-bold">John Eric Malano</span>
                  </div>
                  <div className="p-4 bg-white/5 rounded-sm border border-white/10">
                    <span className="block text-xs text-gold uppercase tracking-widest mb-1">Role</span>
                    <span className="text-ivory font-bold">Senior React Architect</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="tech-stack" title="Tech Stack" icon={Cpu}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-charcoal-light border border-white/5 p-6 rounded-sm">
                  <h3 className="text-gold font-bold mb-2">Core</h3>
                  <ul className="space-y-2 text-sm text-ivory-dim">
                    <li>• React 19 (Latest Features)</li>
                    <li>• Vite (Build Tool)</li>
                    <li>• React Router v8 (client-side routing)</li>
                  </ul>
                </div>
                <div className="bg-charcoal-light border border-white/5 p-6 rounded-sm">
                  <h3 className="text-gold font-bold mb-2">Styling & UI</h3>
                  <ul className="space-y-2 text-sm text-ivory-dim">
                    <li>• Tailwind CSS v4 (Utility-first)</li>
                    <li>• Lucide React (Icons)</li>
                    <li>• Custom CSS Variables (Theming)</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section id="structure" title="Project Structure" icon={Folder}>
              <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm overflow-x-auto">
                <CodeBlock>
{`src/
├── assets/             # Static images
├── components/         # Reusable shared components
│   ├── layout/         # Navbar, Footer
│   ├── ui/             # Atomic UI (Button, Badge)
│   └── feedback/       # Toasts, Modals
├── features/           # Feature-based modules
│   ├── admin/          # Admin dashboard
│   ├── auth/           # Login/Register
│   ├── booking/        # Calendar & Wizard
│   ├── dashboard/      # User dashboard
│   ├── gallery/        # Interactive gallery
│   ├── hero/           # Landing page hero
│   └── ...
├── styles/             # Global styles
└── App.jsx             # Main routing`}
                </CodeBlock>
              </div>
            </Section>

            <Section id="typography" title="Typography" icon={Type}>
              <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm space-y-8">
                <div>
                  <span className="text-xs text-gold uppercase tracking-widest mb-2 block">Headings (Playfair Display)</span>
                  <div className="space-y-4">
                    <div>
                      <h1 className="text-5xl font-serif font-bold text-ivory">Heading 1</h1>
                      <code className="text-xs text-ivory-dim font-mono">text-5xl font-serif font-bold</code>
                    </div>
                    <div>
                      <h2 className="text-4xl font-serif font-bold text-ivory">Heading 2</h2>
                      <code className="text-xs text-ivory-dim font-mono">text-4xl font-serif font-bold</code>
                    </div>
                  </div>
                </div>
                <div className="h-[1px] bg-white/5"></div>
                <div>
                  <span className="text-xs text-gold uppercase tracking-widest mb-2 block">Body (Inter)</span>
                  <div className="space-y-4">
                    <div>
                      <p className="text-base text-ivory">Standard body text.</p>
                      <code className="text-xs text-ivory-dim font-mono">text-base text-ivory</code>
                    </div>
                    <div>
                      <p className="text-sm text-ivory-dim">Dimmed text.</p>
                      <code className="text-xs text-ivory-dim font-mono">text-sm text-ivory-dim</code>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="components" title="UI Components" icon={MousePointer}>
              <div className="space-y-8">
                <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm">
                  <h3 className="text-ivory font-bold mb-6 font-mono border-b border-white/5 pb-2">Buttons</h3>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                  </div>
                  <CodeBlock>{`<Button variant="primary">Action</Button>`}</CodeBlock>
                </div>

                <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm">
                  <h3 className="text-ivory font-bold mb-6 font-mono border-b border-white/5 pb-2">Form Inputs</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Standard Input</label>
                      <input type="text" placeholder="Placeholder..." className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">With Icon</label>
                      <div className="relative">
                        <input type="text" placeholder="Search..." className="w-full bg-charcoal border border-white/10 px-4 py-3 pl-10 text-ivory focus:border-gold focus:outline-none transition-colors" />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim">
                          <SearchIcon className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="feedback" title="Feedback System" icon={MessageSquare}>
              <div className="space-y-8">
                <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm">
                  <h3 className="text-gold font-bold mb-4 uppercase tracking-widest text-xs">Success Flow Rating</h3>
                  <p className="text-ivory-dim mb-6 text-sm">
                    A dedicated rating system triggered immediately after service completion in the <code className="text-gold">QueueTab</code>. It features a 5-star interaction, dynamic encouragement messages, and optional comments to maximize collection rates.
                  </p>
                  <CodeBlock>{`// Triggered in QueueTab on service completion\n<FeedbackModal\n  isOpen={show}\n  queueItem={item}\n  barber={barber}\n  service={service}\n/>`}</CodeBlock>
                  <div className="mt-6">
                    <Button variant="primary" onClick={() => setIsFeedbackModalOpen(true)}>
                      Preview Success Dialog
                    </Button>
                  </div>
                </div>


                <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm">
                  <h3 className="text-ivory font-bold mb-6 font-mono border-b border-white/5 pb-2">Toast Notifications</h3>
                  <div className="flex flex-wrap gap-4 mb-6">
                    <Button variant="outline" onClick={() => addToast({ type: 'success', title: 'Success', message: 'Operation completed.' })}>
                      Trigger Success
                    </Button>
                    <Button variant="outline" onClick={() => addToast({ type: 'error', title: 'Error', message: 'Something went wrong.' })}>
                      Trigger Error
                    </Button>
                  </div>
                  <CodeBlock>{`const { addToast } = useToast();\naddToast({ type: 'success', title: 'Success', message: '...' });`}</CodeBlock>
                </div>
              </div>
            </Section>

            <Section id="theming" title="Theming System" icon={Palette}>
              <div className="bg-charcoal-light border border-white/5 p-8 rounded-sm">
                <p className="text-sm text-ivory-dim mb-6">
                  We use CSS variables defined in <code className="text-gold">src/styles/index.css</code> for consistent theming.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="w-full h-12 bg-[#1C1C1C] border border-white/10 rounded"></div>
                    <p className="text-xs text-ivory font-mono">--color-charcoal</p>
                    <p className="text-[10px] text-ivory-dim">#1C1C1C</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full h-12 bg-[#D4AF37] rounded"></div>
                    <p className="text-xs text-ivory font-mono">--color-gold</p>
                    <p className="text-[10px] text-ivory-dim">#D4AF37</p>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full h-12 bg-[#FFFFF0] rounded"></div>
                    <p className="text-xs text-ivory font-mono">--color-ivory</p>
                    <p className="text-[10px] text-ivory-dim">#FFFFF0</p>
                  </div>
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Documentation Demo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { addToast({ type: 'success', title: 'Confirmed', message: 'Action executed.' }); setIsModalOpen(false); }}>Confirm</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-ivory-dim">This is a demonstration of the reusable Modal component.</p>
          <div className="p-4 bg-white/5 rounded border border-white/10">
            <h4 className="text-gold font-bold text-sm mb-2">Features:</h4>
            <ul className="list-disc pl-4 text-xs text-ivory-dim space-y-1">
              <li>Backdrop blur effect</li>
              <li>Animated entrance</li>
              <li>Scroll lock on body</li>
            </ul>
          </div>
        </div>
      </Modal>

      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)}
        queueItem={dummyQueueItem}
        barber={dummyBarber}
        service={dummyService}
      />
    </div>
  );
};

