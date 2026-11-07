import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import StaffTab from './StaffTab';
import ServicesTab from './ServicesTab';
import StaffShiftManagementTab from './StaffShiftManagementTab';
import RolesAndAccessTab from './RolesAndAccessTab';
import BarbershopReviewsTab from './BarbershopReviewsTab';
import MoneyDrawerTab from './MoneyDrawerTab';
import { AdminTabPanel } from '@/features/admin/components/AdminTabPanel';

export type ManagementSubTab = 'staff' | 'roles-access' | 'shifts' | 'services' | 'reviews' | 'drawer';

interface ManagementTabProps {
    activeSubTab?: string;
    onSelectSubTab?: (subTab: ManagementSubTab) => void;
}

export const ManagementTab: React.FC<ManagementTabProps> = ({
    activeSubTab: propSubTab,
    onSelectSubTab,
}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const subtabParam = searchParams.get('subtab') || searchParams.get('tab');
    
    const resolveSubTab = (): ManagementSubTab => {
        if (propSubTab && ['staff', 'roles-access', 'shifts', 'services', 'reviews', 'drawer'].includes(propSubTab)) {
            return propSubTab as ManagementSubTab;
        }
        if (subtabParam && ['staff', 'roles-access', 'shifts', 'services', 'reviews', 'drawer'].includes(subtabParam)) {
            return subtabParam as ManagementSubTab;
        }
        return 'staff';
    };

    const currentSubTab = resolveSubTab();

    const handleSelectSubTab = (tab: ManagementSubTab, shiftView?: 'calendar' | 'shifts' | 'roster') => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'management');
            next.set('subtab', tab);
            if (shiftView) {
                next.set('shiftView', shiftView);
            }
            return next;
        });
        if (onSelectSubTab) {
            onSelectSubTab(tab);
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col min-w-0">
            {/* Sub-tab content - Horizontal header tabs completely removed as navigation is now in the sidebar */}
            <div className="w-full flex-1 flex flex-col">
                <AnimatePresence mode="wait">
                    <AdminTabPanel
                        key={currentSubTab}
                        panelKey={currentSubTab}
                        className="w-full flex-1 flex flex-col"
                    >
                        {currentSubTab === 'staff' && (
                            <StaffTab
                                onNavigateShifts={() => handleSelectSubTab('shifts', 'shifts')}
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                        {currentSubTab === 'roles-access' && (
                            <RolesAndAccessTab
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                        {currentSubTab === 'shifts' && (
                            <StaffShiftManagementTab
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                        {currentSubTab === 'services' && (
                            <ServicesTab
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                        {currentSubTab === 'reviews' && (
                            <BarbershopReviewsTab
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                        {currentSubTab === 'drawer' && (
                            <MoneyDrawerTab
                                onNavigateSubTab={(sub) => handleSelectSubTab(sub as ManagementSubTab)}
                            />
                        )}
                    </AdminTabPanel>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default ManagementTab;

