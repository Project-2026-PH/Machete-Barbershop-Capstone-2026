import React from 'react';
import { Button } from './Button';

interface SteppingPaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    className?: string;
}

interface PaginationItem {
    label: string;
    page: number;
    type: 'page' | 'jump' | 'ellipsis';
    active: boolean;
}

export const SteppingPagination: React.FC<SteppingPaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    className = '',
}) => {
    if (totalPages <= 1) return null;

    // Helper to generate the pagination blocks
    const getPaginationItems = (): PaginationItem[] => {
        const sections: { page: number; label: string; type: 'page' | 'jump' }[][] = [];

        // 1. First Page
        sections.push([{ page: 1, label: '1', type: 'page' }]);

        // 2. Left Jumps
        const leftJumps: { page: number; label: string; type: 'page' | 'jump' }[] = [];
        if (currentPage - 100 > 2) {
            leftJumps.push({ page: currentPage - 100, label: '-100', type: 'jump' });
        }
        if (currentPage - 50 > 2) {
            leftJumps.push({ page: currentPage - 50, label: '-50', type: 'jump' });
        }
        if (currentPage - 10 > 2) {
            leftJumps.push({ page: currentPage - 10, label: '-10', type: 'jump' });
        }
        if (leftJumps.length > 0) {
            sections.push(leftJumps);
        }

        // 3. Active Window
        const activeWindow: { page: number; label: string; type: 'page' | 'jump' }[] = [];
        let startPage = Math.max(1, currentPage - 1);
        let endPage = Math.min(totalPages, currentPage + 1);

        // Adjust window to always show 3 items if possible
        if (currentPage === 1 && totalPages >= 3) {
            endPage = 3;
        }
        if (currentPage === totalPages && totalPages >= 3) {
            startPage = totalPages - 2;
        }

        for (let p = startPage; p <= endPage; p++) {
            activeWindow.push({ page: p, label: String(p), type: 'page' });
        }
        sections.push(activeWindow);

        // 4. Right Jumps
        const rightJumps: { page: number; label: string; type: 'page' | 'jump' }[] = [];
        if (currentPage + 10 < totalPages - 1) {
            rightJumps.push({ page: currentPage + 10, label: '+10', type: 'jump' });
        }
        if (currentPage + 50 < totalPages - 1) {
            rightJumps.push({ page: currentPage + 50, label: '+50', type: 'jump' });
        }
        if (currentPage + 100 < totalPages - 1) {
            rightJumps.push({ page: currentPage + 100, label: '+100', type: 'jump' });
        }
        if (rightJumps.length > 0) {
            sections.push(rightJumps);
        }

        // 5. Last Page
        if (totalPages > 1) {
            sections.push([{ page: totalPages, label: String(totalPages), type: 'page' }]);
        }

        // Merge sections and insert ellipses
        const mergedItems: PaginationItem[] = [];
        let lastPageNumber = 0;

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            
            // Filter out elements that overlap with already added page numbers
            const filteredSection = section.filter(item => item.page > lastPageNumber && item.page <= totalPages);
            if (filteredSection.length === 0) continue;

            const firstItemInSection = filteredSection[0];

            // If there's a gap between this section and the last added page, insert ellipsis
            if (lastPageNumber > 0 && firstItemInSection.page - lastPageNumber > 1) {
                mergedItems.push({
                    label: '...',
                    page: 0,
                    type: 'ellipsis',
                    active: false,
                });
            }

            for (const item of filteredSection) {
                mergedItems.push({
                    label: item.label,
                    page: item.page,
                    type: item.type,
                    active: item.page === currentPage,
                });
                lastPageNumber = item.page;
            }
        }

        return mergedItems;
    };

    const items = getPaginationItems();

    return (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 w-full ${className}`}>
            {/* Mobile View: Compact Previous/Next with indicator */}
            <div className="flex sm:hidden items-center justify-between w-full gap-3">
                <Button
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    variant="outline"
                    className="flex-1 text-xs py-2"
                >
                    Previous
                </Button>
                <span className="text-ivory-dim text-xs font-mono whitespace-nowrap">
                    Page {currentPage} of {totalPages}
                </span>
                <Button
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    variant="outline"
                    className="flex-1 text-xs py-2"
                >
                    Next
                </Button>
            </div>

            {/* Desktop / Tablet View: Stepping and jump buttons */}
            <div className="hidden sm:flex flex-wrap items-center justify-center gap-1.5 md:gap-2 w-full">
                <Button
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    variant="outline"
                    className="px-3 py-1.5 text-xs font-serif tracking-wider uppercase border-white/5 hover:border-gold/30 hover:text-gold"
                >
                    Previous
                </Button>

                <div className="flex items-center gap-1">
                    {items.map((item, idx) => {
                        if (item.type === 'ellipsis') {
                            return (
                                <span
                                    key={`ellipsis-${idx}`}
                                    className="px-2 text-ivory-dim select-none"
                                >
                                    {item.label}
                                </span>
                            );
                        }

                        const isActive = item.active;
                        const isJump = item.type === 'jump';

                        return (
                            <button
                                key={`page-${item.page}-${idx}`}
                                onClick={() => onPageChange(item.page)}
                                className={`px-2.5 py-1.5 text-xs rounded-sm font-mono transition-all border ${
                                    isActive
                                        ? 'bg-gold border-gold text-charcoal font-bold shadow-md shadow-gold/20 scale-105'
                                        : isJump
                                        ? 'bg-gold/5 border-gold/20 text-gold hover:bg-gold/20 hover:border-gold/40'
                                        : 'bg-transparent border-white/5 text-ivory hover:bg-white/5 hover:border-white/10'
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                <Button
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    variant="outline"
                    className="px-3 py-1.5 text-xs font-serif tracking-wider uppercase border-white/5 hover:border-gold/30 hover:text-gold"
                >
                    Next
                </Button>
            </div>
        </div>
    );
};
