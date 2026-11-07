import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface StyleTagModifierModalProps {
    isOpen: boolean;
    initialBaseStyle?: string;
    initialLength?: string;
    initialAccent?: string;
    onClose: () => void;
    onSave: (styleTag: string) => void;
}

export const StyleTagModifierModal: React.FC<StyleTagModifierModalProps> = ({
    isOpen,
    initialBaseStyle = 'Mid Fade',
    initialLength = '#1 (3mm)',
    initialAccent = 'Textured Crop',
    onClose,
    onSave
}) => {
    const [baseStyle, setBaseStyle] = useState(initialBaseStyle);
    const [length, setLength] = useState(initialLength);
    const [accent, setAccent] = useState(initialAccent);

    useEffect(() => {
        if (isOpen) {
            setBaseStyle(initialBaseStyle);
            setLength(initialLength);
            setAccent(initialAccent);
        }
    }, [isOpen, initialBaseStyle, initialLength, initialAccent]);

    if (!isOpen) return null;

    const handleSave = () => {
        const fullTag = `${length} ${baseStyle} with ${accent}`;
        onSave(fullTag);
    };

    return (
        <div className="border border-white/15 bg-charcoal-light p-4 sm:p-6 rounded-sm shadow-2xl space-y-4 relative">
            <h5 className="font-serif font-bold text-gold text-sm uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Edit Pre-Defined Hairstyle Tags
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block mb-1">Base Style</label>
                    <select 
                        value={baseStyle} 
                        onChange={e => setBaseStyle(e.target.value)}
                        className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 sm:p-2 text-xs text-ivory focus:border-gold focus:outline-none"
                    >
                        <option value="Fade">Fade</option>
                        <option value="Buzz Cut">Buzz Cut</option>
                        <option value="Undercut">Undercut</option>
                        <option value="Pompadour">Pompadour</option>
                        <option value="Taper">Taper</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block mb-1">Length</label>
                    <select 
                        value={length} 
                        onChange={e => setLength(e.target.value)}
                        className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 sm:p-2 text-xs text-ivory focus:border-gold focus:outline-none"
                    >
                        <option value="Low">Low</option>
                        <option value="Mid">Mid</option>
                        <option value="High">High</option>
                        <option value="Skin">Skin</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block mb-1">Accent</label>
                    <select 
                        value={accent} 
                        onChange={e => setAccent(e.target.value)}
                        className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 sm:p-2 text-xs text-ivory focus:border-gold focus:outline-none"
                    >
                        <option value="Textured Crop">Textured Crop</option>
                        <option value="Side Part">Side Part</option>
                        <option value="Slick Back">Slick Back</option>
                        <option value="Line Up">Line Up</option>
                        <option value="Fringe">Fringe</option>
                    </select>
                </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button 
                    onClick={onClose} 
                    className="w-full sm:w-auto px-4 py-2 border border-white/10 hover:bg-white/5 text-xs text-ivory rounded-sm cursor-pointer text-center"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSave}
                    className="w-full sm:w-auto px-4 py-2 bg-gold hover:bg-gold-600 text-charcoal font-bold text-xs rounded-sm cursor-pointer text-center"
                >
                    Save Specification
                </button>
            </div>
        </div>
    );
};
