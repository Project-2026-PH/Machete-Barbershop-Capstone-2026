import type { ElementType } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface DashboardSidebarHeaderProps {
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    moduleName: string;
    moduleIcon: ElementType;
}

export const DashboardSidebarHeader = ({
    isCollapsed,
    onToggleCollapsed,
    moduleName,
    moduleIcon: ModuleIcon,
}: DashboardSidebarHeaderProps) => (
    <div className={`border-b border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent ${isCollapsed ? 'p-3' : 'px-4 py-5'}`}>
        <div className={isCollapsed ? 'flex flex-col items-center' : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5'}>
            <div className="relative row-span-2 flex shrink-0 items-center justify-center">
                <div className="absolute inset-0 animate-pulse rounded-full bg-gold/20 blur-md" />
                <img src="/demoshop_logo.png" alt="DemoShop Logo" width={256} height={256} decoding="async" className="relative h-10 w-auto object-contain drop-shadow-[0_2px_10px_rgba(212,175,55,0.35)]" />
            </div>
            <span className={`${isCollapsed ? 'hidden' : 'block'} col-span-2 min-w-0 font-serif text-lg font-bold tracking-widest text-ivory`}>DEMOSHOP<span className="text-gold">'S</span></span>
            <span title={moduleName} className={`${isCollapsed ? 'hidden' : 'inline-flex'} min-w-0 w-fit max-w-full items-center gap-1 rounded-[3px] border border-gold/30 bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gold`}>
                <ModuleIcon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{moduleName}</span>
            </span>
            <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!isCollapsed}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className={`flex cursor-pointer items-center justify-center rounded-sm text-ivory-dim/70 transition-colors hover:bg-white/[0.05] hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${isCollapsed ? 'mt-4 w-full p-2' : 'p-1.5'}`}
            >
                {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
        </div>
    </div>
);
