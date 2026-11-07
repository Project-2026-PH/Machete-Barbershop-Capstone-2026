import React from 'react';
import { LogOut } from 'lucide-react';

export const APP_VERSION = 'v1.0.4';
export const APP_COPYRIGHT_YEAR = 2026;
export const APP_SYSTEM_NAME = 'Management System';

export interface DashboardSidebarFooterProps {
    onLogout?: () => void;
    logoutLabel?: string;
    version?: string;
    year?: number | string;
    systemName?: string;
    className?: string;
}

export const DashboardSidebarFooter: React.FC<DashboardSidebarFooterProps> = ({
    onLogout,
    logoutLabel = 'Log Out',
    version = APP_VERSION,
    year = APP_COPYRIGHT_YEAR,
    systemName = APP_SYSTEM_NAME,
    className = '',
}) => {
    return (
        <div className={`p-4 border-t border-white/5 bg-charcoal/40 shrink-0 select-none mt-auto ${className}`}>
            {/* Account Action: Single clear desktop logout */}
            {onLogout && (
                <>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-ivory-dim/70 hover:text-red-400 hover:bg-red-500/10 rounded-sm border border-transparent hover:border-red-500/20 transition-all cursor-pointer group"
                    >
                        <LogOut className="w-3.5 h-3.5 text-ivory-dim/60 group-hover:text-red-400 transition-colors" />
                        <span>{logoutLabel}</span>
                    </button>
                    <div className="border-t border-white/5 my-3" />
                </>
            )}

            {/* Subtle Brand & Version Information */}
            <div className="text-center space-y-0.5">
                <div className="font-serif text-[11px] font-bold tracking-widest text-ivory/80 uppercase">
                    DEMOSHOP<span className="text-gold font-serif">'S</span>
                </div>
                <div className="text-[10px] tracking-wider text-ivory-dim/50 uppercase font-medium">
                    {systemName}
                </div>
                <div className="text-[9.5px] font-mono text-ivory-dim/40 tracking-wider pt-0.5">
                    {version} • © {year}
                </div>
            </div>
        </div>
    );
};

export default DashboardSidebarFooter;
