import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { MoreHorizontal, LogOut, X, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from './Portal';
import { useAvailableModules } from '@/components/navigation/useAvailableModules';

export interface MobileNavItem {
    id: string;
    label: string;
    icon: LucideIcon | React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
    isActive?: boolean;
    isCenter?: boolean;
    badge?: number;
    badgeDot?: boolean;
    ariaLabel?: string;
    subLabel?: string;
    isDestructive?: boolean;
    onClick?: () => void;
}

export interface MobileBottomNavigationProps {
    items: MobileNavItem[];
    moreItems?: MobileNavItem[];
    activeId?: string;
    centerActionId?: string;
    onSelectTab?: (id: string) => void;
    onLogout?: () => void;
    moreTitle?: string;
    ariaLabel?: string;
    activeQueueBadge?: boolean;
    topSlot?: React.ReactNode;
    className?: string;
}

interface MobileMoreSheetProps {
    isOpen: boolean;
    onClose: () => void;
    items: MobileNavItem[];
    onSelectTab?: (id: string) => void;
    onLogout?: () => void;
    title?: string;
    activeId?: string;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
    isOpen,
    onClose,
    items,
    onSelectTab,
    onLogout,
    title = 'More Options',
    activeId,
}) => {
    const { availableModules, hasMultipleModules } = useAvailableModules();
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    return (
        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <div
                        className="fixed inset-0 z-[100] flex flex-col justify-end lg:hidden select-none"
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                    >
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/75 backdrop-blur-xs cursor-pointer"
                            onClick={onClose}
                            aria-hidden="true"
                        />

                        {/* Bottom Sheet Drawer */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                            className="relative w-full max-w-lg mx-auto bg-charcoal-light border-t border-white/10 rounded-t-2xl shadow-2xl z-10 flex flex-col max-h-[82vh] overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Drag Indicator */}
                            <div className="flex justify-center pt-3 pb-1 shrink-0">
                                <div className="w-10 h-1 bg-white/20 rounded-full" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-serif text-xs font-bold tracking-widest text-gold uppercase">
                                        {title}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Close menu"
                                    className="p-1.5 rounded-full text-ivory-dim hover:text-ivory hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-gold/30"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Options List */}
                            <div className="p-3 space-y-1.5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                                {items.map((item) => {
                                    const Icon = item.icon;
                                    const isItemActive = item.isActive !== undefined ? item.isActive : item.id === activeId;

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                if (item.onClick) {
                                                    item.onClick();
                                                } else if (onSelectTab) {
                                                    onSelectTab(item.id);
                                                }
                                                onClose();
                                            }}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer text-left min-h-[48px] ${
                                                isItemActive
                                                    ? 'bg-gold/15 text-gold font-bold border border-gold/40 shadow-sm'
                                                    : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div
                                                    className={`p-2 rounded-lg shrink-0 transition-colors ${
                                                        isItemActive
                                                            ? 'bg-gold text-charcoal'
                                                            : 'bg-charcoal text-gold/80 border border-white/5'
                                                    }`}
                                                >
                                                    <Icon className="w-5 h-5" strokeWidth={isItemActive ? 2.5 : 2} />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className={`text-sm tracking-wide truncate ${isItemActive ? 'text-gold font-bold' : 'text-ivory font-medium'}`}>
                                                        {item.label}
                                                    </span>
                                                    {item.subLabel && (
                                                        <span className="text-[11px] text-ivory-dim/60 truncate mt-0.5">
                                                            {item.subLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.badge !== undefined && item.badge > 0 && (
                                                <span className="bg-[#e05555] text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ml-2 shadow-sm">
                                                    {item.badge > 99 ? '99+' : item.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Optional Log Out Section */}
                            {/* Cross-Module Switching (for accounts with access to multiple workspaces) */}
                            {hasMultipleModules && (
                                <div className="px-3 pt-2 pb-1 border-t border-white/5 shrink-0">
                                    <div className="px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-gold/80 flex items-center justify-between">
                                        <span>Switch System Module</span>
                                        <span className="text-[9px] text-ivory-dim/40 font-normal">
                                            {availableModules.length} available
                                        </span>
                                    </div>
                                    <div className="space-y-1 mt-1 max-h-48 overflow-y-auto custom-scrollbar">
                                        {availableModules.map((mod) => {
                                            const Icon = mod.icon;
                                            const isCurrent = location.pathname.startsWith(mod.path);
                                            return (
                                                <button
                                                    key={mod.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onClose();
                                                        if (!isCurrent) {
                                                            navigate(mod.path);
                                                        }
                                                    }}
                                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer text-left min-h-[44px] ${
                                                        isCurrent
                                                            ? 'bg-gold/15 text-gold font-bold border border-gold/40'
                                                            : 'text-ivory-dim/80 hover:text-ivory hover:bg-white/5 border border-transparent'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`p-1.5 rounded-lg shrink-0 ${isCurrent ? 'bg-gold text-charcoal' : 'bg-charcoal text-gold border border-white/5'}`}>
                                                            <Icon className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-xs font-medium tracking-wide truncate">{mod.label}</span>
                                                    </div>
                                                    {isCurrent && (
                                                        <span className="text-[9px] font-mono uppercase tracking-wider text-gold shrink-0">Current</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {onLogout && (
                                <div
                                    className="p-3 border-t border-white/5 bg-black/20 shrink-0"
                                    style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onLogout();
                                        }}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer border border-red-500/20 min-h-[48px]"
                                    >
                                        <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                                            <LogOut className="w-5 h-5" strokeWidth={2} />
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-sm font-semibold tracking-wide">
                                                Log Out
                                            </span>
                                            <span className="text-[10px] text-red-400/60">
                                                Sign out of current session
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </Portal>
    );
};

export const MobileBottomNavigation: React.FC<MobileBottomNavigationProps> = ({
    items,
    moreItems,
    activeId,
    centerActionId,
    onSelectTab,
    onLogout,
    moreTitle = 'More Options',
    ariaLabel = 'Mobile navigation',
    activeQueueBadge = false,
    topSlot,
    className = '',
}) => {
    const [isMoreOpen, setIsMoreOpen] = useState(false);

    const hasOverflow = Boolean(moreItems && moreItems.length > 0);

    // Identify if an explicit center action button is requested
    const hasCenterAction = Boolean(items.some((item) => item.isCenter) || centerActionId);
    const centerItem = hasCenterAction
        ? (items.find((item) => item.isCenter || (centerActionId && item.id === centerActionId)) || items[Math.floor(items.length / 2)])
        : null;

    // Filter surrounding items when center item is extracted, or preserve all items
    const surroundingItems = hasCenterAction
        ? items.filter((item) => item !== centerItem)
        : items;

    // Check if any secondary item in moreItems is active
    const isMoreActive = hasOverflow && moreItems!.some((item) =>
        item.isActive !== undefined ? item.isActive : item.id === activeId
    );

    // Total badges inside moreItems
    const totalMoreBadge = hasOverflow
        ? moreItems!.reduce((acc, item) => acc + (item.badge || 0), 0)
        : 0;

    // Build exactly 5 layout slots with equal flex/grid distribution:
    const slot1 = surroundingItems[0];
    const slot2 = surroundingItems[1];
    const slot3 = hasCenterAction ? centerItem : surroundingItems[2];
    const slot4 = hasCenterAction ? surroundingItems[2] : surroundingItems[3];
    const slot5 = hasOverflow ? null : (hasCenterAction ? surroundingItems[3] : surroundingItems[4]);

    const renderNormalItem = (item: MobileNavItem) => {
        const Icon = item.icon;
        const isItemActive = item.isActive !== undefined ? item.isActive : item.id === activeId;
        const isDestructive = item.isDestructive || item.id === 'logout';

        if (isDestructive) {
            return (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                        if (item.onClick) item.onClick();
                        else if (onLogout) onLogout();
                    }}
                    aria-label={item.ariaLabel || item.label}
                    className="w-full flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 text-red-400/80 hover:text-red-400 transition-colors duration-200 cursor-pointer min-h-[48px] rounded-lg"
                >
                    <div className="p-1.5 rounded-lg">
                        <Icon className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] uppercase tracking-tight font-medium truncate max-w-full text-center leading-tight">
                        {item.label}
                    </span>
                </button>
            );
        }

        return (
            <button
                key={item.id}
                type="button"
                onClick={() => {
                    if (item.onClick) item.onClick();
                    else if (onSelectTab) onSelectTab(item.id);
                }}
                aria-label={item.ariaLabel || item.label}
                className={`w-full flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 transition-all duration-200 cursor-pointer min-h-[48px] rounded-lg group ${
                    isItemActive
                        ? 'text-gold'
                        : 'text-ivory-dim/70 hover:text-ivory'
                }`}
            >
                <div className="relative inline-flex items-center justify-center">
                    <div className={`p-1.5 rounded-lg transition-all duration-200 ${
                        isItemActive ? 'bg-gold/15 text-gold border border-gold/30 shadow-xs' : 'text-ivory-dim/70 group-hover:text-ivory'
                    }`}>
                        <Icon
                            className={`w-5 h-5 transition-transform duration-200 ${
                                isItemActive ? 'scale-105 text-gold' : ''
                            }`}
                            strokeWidth={isItemActive ? 2.2 : 1.8}
                        />
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                        <span className="absolute -top-1 -right-2 bg-[#e05555] text-white text-[9px] font-black min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center shadow-md animate-pulse leading-none border border-charcoal-light">
                            {item.badge > 99 ? '99+' : item.badge}
                        </span>
                    )}
                </div>
                <span className={`text-[10px] uppercase tracking-tight truncate max-w-full text-center leading-tight ${
                    isItemActive ? 'font-bold text-gold' : 'font-medium text-ivory-dim/70 group-hover:text-ivory'
                }`}>
                    {item.label}
                </span>
            </button>
        );
    };

    const renderMoreButton = () => {
        return (
            <button
                type="button"
                onClick={() => setIsMoreOpen(true)}
                aria-label="More options"
                aria-expanded={isMoreOpen}
                className={`w-full flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 transition-all duration-200 cursor-pointer min-h-[48px] rounded-lg group ${
                    isMoreActive
                        ? 'text-gold'
                        : 'text-ivory-dim/70 hover:text-ivory'
                }`}
            >
                <div className="relative inline-flex items-center justify-center">
                    <div className={`p-1.5 rounded-lg transition-all duration-200 ${
                        isMoreActive ? 'bg-gold/15 text-gold border border-gold/30 shadow-xs' : 'text-ivory-dim/70 group-hover:text-ivory'
                    }`}>
                        <MoreHorizontal
                            className={`w-5 h-5 transition-transform duration-200 ${
                                isMoreActive ? 'scale-105 text-gold' : ''
                            }`}
                            strokeWidth={isMoreActive ? 2.2 : 1.8}
                        />
                    </div>
                    {totalMoreBadge > 0 && (
                        <span className="absolute -top-1 -right-2 bg-[#e05555] text-white text-[9px] font-black min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center shadow-md animate-pulse leading-none border border-charcoal-light">
                            {totalMoreBadge > 99 ? '99+' : totalMoreBadge}
                        </span>
                    )}
                </div>
                <span className={`text-[10px] uppercase tracking-tight truncate max-w-full text-center leading-tight ${
                    isMoreActive ? 'font-bold text-gold' : 'font-medium text-ivory-dim/70 group-hover:text-ivory'
                }`}>
                    More
                </span>
            </button>
        );
    };

    const renderCenterItem = (item: MobileNavItem) => {
        const Icon = item.icon;
        const isItemActive = item.isActive !== undefined ? item.isActive : item.id === activeId;

        return (
            <div key={item.id} className="relative -top-3 z-10 flex flex-col items-center justify-center w-full">
                <button
                    type="button"
                    onClick={() => {
                        if (item.onClick) item.onClick();
                        else if (onSelectTab) onSelectTab(item.id);
                    }}
                    aria-label={item.ariaLabel || item.label}
                    className={`bottom-nav-center-btn flex flex-col items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-200 cursor-pointer ${
                        isItemActive
                            ? 'bg-gold text-charcoal scale-105 shadow-[0_0_16px_rgba(212,175,55,0.6)] ring-4 ring-gold/20'
                            : 'bg-charcoal border border-white/20 text-ivory-dim hover:text-gold hover:border-gold/40 shadow-md'
                    }`}
                >
                    <Icon className="w-6 h-6 transition-colors duration-200" strokeWidth={isItemActive ? 2.5 : 2} />
                </button>
                {(activeQueueBadge || item.badgeDot) && (
                    <span className="absolute top-0 right-1/2 translate-x-3.5 w-3 h-3 bg-red-500 rounded-full border-2 border-charcoal-light animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                )}
                {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 right-1/2 translate-x-3.5 bg-[#e05555] text-white text-[9px] font-black min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center shadow-md animate-pulse leading-none border-2 border-charcoal-light">
                        {item.badge > 99 ? '99+' : item.badge}
                    </span>
                )}
                <span className={`block text-center text-[10px] uppercase tracking-tight font-semibold mt-1 truncate max-w-full px-1 ${
                    isItemActive ? 'text-gold' : 'text-ivory-dim/70'
                }`}>
                    {item.label}
                </span>
            </div>
        );
    };

    return (
        <>
            <nav
                aria-label={ariaLabel}
                className={`fixed bottom-0 left-0 right-0 bg-charcoal-light/95 backdrop-blur-md border-t border-white/10 px-3 pt-2 z-50 shadow-2xl lg:hidden select-none print:hidden ${className}`}
                style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
                {/* Top Slot (e.g. Sub-Navigation Trigger) with safe vertical clearance and clear dividing border */}
                {topSlot && (
                    <div className="pb-2 mb-1.5 border-b border-white/10 relative z-20 pointer-events-auto w-full flex justify-center">
                        {topSlot}
                    </div>
                )}

                {/* Rigid 5-slot grid: equal flex-1 width per tab */}
                <div className="grid grid-cols-5 items-center w-full max-w-md mx-auto relative">
                    {/* Slot 1 */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                        {slot1 ? renderNormalItem(slot1) : null}
                    </div>

                    {/* Slot 2 */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                        {slot2 ? renderNormalItem(slot2) : null}
                    </div>

                    {/* Slot 3: Center Action OR standard middle tab */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                        {hasCenterAction && slot3 ? renderCenterItem(slot3) : (slot3 ? renderNormalItem(slot3) : null)}
                    </div>

                    {/* Slot 4 */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                        {slot4 ? renderNormalItem(slot4) : null}
                    </div>

                    {/* Slot 5: More button OR 5th destination */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                        {hasOverflow ? (
                            renderMoreButton()
                        ) : slot5 ? (
                            renderNormalItem(slot5)
                        ) : null}
                    </div>
                </div>
            </nav>

            {/* Overflow Bottom Sheet */}
            {hasOverflow && (
                <MobileMoreSheet
                    isOpen={isMoreOpen}
                    onClose={() => setIsMoreOpen(false)}
                    items={moreItems!}
                    onSelectTab={onSelectTab}
                    onLogout={onLogout}
                    title={moreTitle}
                    activeId={activeId}
                />
            )}
        </>
    );
};

export default MobileBottomNavigation;
