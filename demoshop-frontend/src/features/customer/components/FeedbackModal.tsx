import React, { useState, useEffect } from 'react';
import { Star, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { ProfanityFilter } from '@demoshop/shared-types';

const messages = [
    "How did we do today?",
    "Your feedback helps us grow!",
    "Love your new look? Let us know!",
    "Quick! Tell us how your haircut was.",
    "Help others find the best style!",
    "Was your barber a cut above the rest?",
    "A second of your time helps us a lot!",
    "How's the new fade feeling?",
    "Rate your experience to help us improve.",
    "Did you enjoy your visit today?"
];

interface SharpStarProps {
    className: string;
    filled: boolean;
}

const SharpStar: React.FC<SharpStarProps> = ({ className, filled }) => (
    <svg 
        viewBox="0 0 24 24" 
        className={className}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="square" 
        strokeLinejoin="miter"
    >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    queueItem: any;
    barber: any;
    service: any;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, queueItem, barber, service }) => {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [randomMessage, setRandomMessage] = useState('');
    const { addToast } = useToast();

    useEffect(() => {
        if (isOpen) {
            setRandomMessage(messages[Math.floor(Math.random() * messages.length)]);
            setRating(0);
            setComment('');
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (rating === 0) return;
        if (comment) {
            const check = ProfanityFilter.getInstance().validateFeedback(comment);
            if (!check.isValid) {
                addToast({
                    type: 'error',
                    title: 'Inappropriate Content',
                    message: check.reason || 'Feedback contains curse or offensive slang words.',
                    duration: 4000,
                });
                return;
            }
        }
        setIsSubmitting(true);

        try {
            await api.post('/api/feedback/rate', {
                queueId: queueItem.id,
                stars: rating,
                comment: comment
            });
            addToast({
                type: 'success',
                title: 'Thank You!',
                message: 'Your feedback has been submitted.',
                duration: 4000,
            });
            onClose();
        } catch (err) {
            console.error('[FeedbackModal] Error:', err);
            addToast({
                type: 'error',
                title: 'Error',
                message: 'Failed to submit feedback. Please try again.',
                duration: 4000,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Success!"
            size="md"
        >
            <div className="flex flex-col items-center text-center space-y-6 py-4">
                {/* Context Section */}
                <div className="bg-white/5 border border-white/10 rounded-sm p-4 w-full">
                    <p className="text-xs uppercase tracking-widest text-gold font-bold mb-1">Service Summary</p>
                    <p className="text-ivory font-serif text-lg">{service?.name || 'Haircut'}</p>
                    <p className="text-ivory-dim text-sm">Barber: {barber?.name || 'Your Barber'}</p>
                </div>

                {/* Dynamic Message */}
                <p className="text-ivory text-xl font-serif italic text-gold">
                    "{randomMessage}"
                </p>

                {/* Star Rating */}
                <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            onClick={() => setRating(star)}
                            className="focus:outline-none group transition-transform active:scale-95"
                        >
                            <SharpStar
                                filled={star <= rating}
                                className={`w-10 h-10 transition-all duration-300 ${
                                    star <= rating 
                                        ? 'text-gold scale-110' 
                                        : 'text-white/20 hover:text-white/40'
                                } group-hover:scale-110`}

                            />
                        </button>
                    ))}
                </div>


                {/* Optional Message Box */}
                <div className="w-full space-y-2">
                    <label className="block text-[10px] uppercase tracking-widest text-ivory-dim font-bold text-left">
                        Additional Comments (Optional)
                    </label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Tell us more about your visit..."
                        className="w-full bg-charcoal border border-white/10 p-4 text-ivory text-sm focus:border-gold focus:outline-none transition-colors min-h-[100px] resize-none"
                    />
                </div>

                {/* Action Area */}
                <div className="w-full space-y-4 pt-4">
                    {rating > 0 && (
                        <Button
                            variant="primary"
                            className="w-full py-4 text-lg font-bold animate-fade-in"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Submitting...</>
                            ) : (
                                'Submit Rating'
                            )}
                        </Button>
                    )}

                    <button
                        onClick={onClose}
                        className="text-ivory-dim text-sm hover:text-ivory underline-offset-4 hover:underline transition-colors block mx-auto"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        </Modal>
    );
};
