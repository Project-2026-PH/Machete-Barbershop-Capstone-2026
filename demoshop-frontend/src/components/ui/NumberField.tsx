import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface NumberFieldProps {
    value: string | number;
    onChange: (value: string) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    className?: string;
    touchControls?: boolean;
}

/**
 * NumberField component conforming to @reui/c-number-field-5 specification.
 * Features inline input with integrated stacked increment/decrement chevron spinners
 * and adheres to DemoShop UI theme (charcoal/ivory/gold tokens).
 */
export const NumberField: React.FC<NumberFieldProps> = ({
    value,
    onChange,
    min = 0,
    max,
    step = 1,
    disabled = false,
    placeholder = '0',
    ariaLabel,
    className = '',
    touchControls = false,
}) => {
    const stringValue = value !== undefined && value !== null ? String(value) : '';

    const handleIncrement = () => {
        if (disabled) return;
        const current = stringValue.trim() === '' ? 0 : Number(stringValue);
        if (Number.isNaN(current)) {
            onChange(String(min));
            return;
        }
        const next = current + step;
        if (max !== undefined && next > max) return;
        onChange(String(next));
    };

    const handleDecrement = () => {
        if (disabled) return;
        const current = stringValue.trim() === '' ? 0 : Number(stringValue);
        if (Number.isNaN(current)) {
            onChange(String(min));
            return;
        }
        const next = current - step;
        if (min !== undefined && next < min) return;
        onChange(String(next));
    };

    return (
        <div
            className={`group relative flex items-center justify-between overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/80 transition-all focus-within:border-gold focus-within:bg-white focus-within:ring-2 focus-within:ring-gold/20 dark:border-white/10 dark:bg-charcoal dark:focus-within:bg-charcoal ${disabled
                    ? 'border-transparent bg-transparent opacity-80 pointer-events-none'
                    : 'hover:border-neutral-300 dark:hover:border-white/20'
                } ${className}`}
        >
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                inputMode="numeric"
                value={stringValue}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={ariaLabel}
                className="w-full min-w-0 flex-1 bg-transparent px-3 py-1.5 text-right text-[13px] md:text-sm font-medium text-neutral-800 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:text-neutral-500 dark:text-ivory dark:placeholder:text-ivory-dim/40 dark:disabled:text-emerald-300/80 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            {!disabled && (
                <div className={`${touchControls ? 'm-0 flex-row sm:m-1 sm:flex-col' : 'm-1 flex-col'} flex shrink-0 overflow-hidden rounded-md border border-neutral-200/80 bg-neutral-200/40 dark:border-white/10 dark:bg-white/5`}>
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={handleIncrement}
                        disabled={disabled || (max !== undefined && Number(stringValue) >= max)}
                        className={`flex items-center justify-center ${touchControls ? 'h-8 w-8 border-r border-neutral-200/80 sm:h-3.5 sm:w-5 sm:border-b sm:border-r-0' : 'h-3.5 w-5 border-b border-neutral-200/80'} text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-gold active:bg-neutral-300 disabled:opacity-30 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/15 dark:hover:text-gold`}
                        aria-label="Increase value"
                    >
                        <ChevronUp className={touchControls ? 'h-4 w-4 sm:h-3 sm:w-3' : 'h-3 w-3'} />
                    </button>
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={handleDecrement}
                        disabled={disabled || (min !== undefined && stringValue.trim() !== '' && Number(stringValue) <= min)}
                        className={`flex items-center justify-center ${touchControls ? 'h-8 w-8 sm:h-3.5 sm:w-5' : 'h-3.5 w-5'} text-neutral-500 hover:bg-neutral-200 hover:text-gold active:bg-neutral-300 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-white/15 dark:hover:text-gold`}
                        aria-label="Decrease value"
                    >
                        <ChevronDown className={touchControls ? 'h-4 w-4 sm:h-3 sm:w-3' : 'h-3 w-3'} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default NumberField;
