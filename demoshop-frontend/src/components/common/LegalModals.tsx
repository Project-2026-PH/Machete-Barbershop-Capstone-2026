import React from 'react';
import { ShieldCheck, FileText, Clock } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { useShopSettings } from '@/hooks/useShopSettings';
import { PublicDocumentRenderer } from '@/components/documents/PublicDocumentRenderer';

interface LegalModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
    const { settings, loading } = useShopSettings();
    const doc = settings?.legalDocs?.privacyPolicy || settings?.legal?.privacyPolicy;
    const content = doc?.contentMarkdown || doc?.content || '';
    const lastUpdated = doc?.lastUpdated || 'Current';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Privacy Policy"
            size="lg"
            footer={
                <Button 
                    variant="primary" 
                    className="bg-gold hover:bg-gold-600 border-gold text-charcoal font-bold"
                    onClick={onClose}
                >
                    Close
                </Button>
            }
        >
            <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                <div className="flex items-center gap-1.5 text-xs text-gold/80 font-mono pb-2 border-b border-white/5">
                    <Clock className="w-3.5 h-3.5 text-gold" />
                    <span>Last Updated: <strong className="text-ivory">{lastUpdated}</strong></span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-ivory-dim text-xs animate-pulse">
                        Loading Privacy Policy...
                    </div>
                ) : (
                    <PublicDocumentRenderer content={content} showToc={false} isCompact={true} />
                )}
            </div>
        </Modal>
    );
};

export const TermsOfServiceModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
    const { settings, loading } = useShopSettings();
    const doc = settings?.legalDocs?.termsOfService || settings?.legal?.termsOfService;
    const content = doc?.contentMarkdown || doc?.content || '';
    const lastUpdated = doc?.lastUpdated || 'Current';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Terms of Service"
            size="lg"
            footer={
                <Button 
                    variant="primary" 
                    className="bg-gold hover:bg-gold-600 border-gold text-charcoal font-bold"
                    onClick={onClose}
                >
                    Close
                </Button>
            }
        >
            <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                <div className="flex items-center gap-1.5 text-xs text-gold/80 font-mono pb-2 border-b border-white/5">
                    <Clock className="w-3.5 h-3.5 text-gold" />
                    <span>Last Updated: <strong className="text-ivory">{lastUpdated}</strong></span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-ivory-dim text-xs animate-pulse">
                        Loading Terms of Service...
                    </div>
                ) : (
                    <PublicDocumentRenderer content={content} showToc={false} isCompact={true} />
                )}
            </div>
        </Modal>
    );
};

interface LegalFooterLinksProps {
    onOpenPrivacy: () => void;
    onOpenTerms: () => void;
}

export const LegalFooterLinks: React.FC<LegalFooterLinksProps> = ({ onOpenPrivacy, onOpenTerms }) => {
    return (
        <div className="flex items-center justify-center gap-3 text-[11px] text-ivory-dim/70 px-1">
            <button 
                type="button"
                onClick={onOpenPrivacy}
                className="hover:text-gold transition-colors flex items-center gap-1.5 cursor-pointer py-1"
            >
                <ShieldCheck className="w-3.5 h-3.5 text-gold/80" />
                <span>Privacy Policy</span>
            </button>
            <span className="text-white/20">•</span>
            <button 
                type="button"
                onClick={onOpenTerms}
                className="hover:text-gold transition-colors flex items-center gap-1.5 cursor-pointer py-1"
            >
                <FileText className="w-3.5 h-3.5 text-gold/80" />
                <span>Terms of Service</span>
            </button>
        </div>
    );
};
