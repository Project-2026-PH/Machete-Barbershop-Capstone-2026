import React, { useEffect, useState } from 'react';
import { api } from '@/config/api';
import { useAuth } from '@/components/auth/AuthContext';

interface PrintReportHeaderProps {
    title: string;
    startDate: string;
    endDate: string;
}

const DEFAULT_SHOP = "DemoShop's Barbershop";
const DEFAULT_BRANCH = 'SampleBranch, Brgy. Kaypian, SJDM, Bulacan';

export const PrintReportHeader: React.FC<PrintReportHeaderProps> = ({ title, startDate, endDate }) => {
    const { user, role } = useAuth();
    const [shopName, setShopName] = useState(DEFAULT_SHOP);
    const [branchName, setBranchName] = useState(DEFAULT_BRANCH);
    const generatedAt = new Date().toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    useEffect(() => {
        let cancelled = false;
        void api.get('/api/admin/settings').then((response) => {
            if (cancelled) return;
            const data = response.data || {};
            if (typeof data.shopName === 'string' && data.shopName.trim()) {
                setShopName(data.shopName.trim());
            }
            if (typeof data.physicalAddress === 'string' && data.physicalAddress.trim()) {
                setBranchName(data.physicalAddress.trim());
            }
        }).catch(() => {
            // Keep document defaults when settings are unavailable.
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const generatedBy = user?.username || user?.email || role || 'Shop Admin';

    return (
        <div className="report-print-header hidden print:block" aria-hidden="true">
            <div className="report-print-brand">
                <div className="report-print-logo-wrap">
                    <img
                        src="/demoshop_logo.png"
                        alt="DemoShop's Barbershop crest"
                        className="report-print-logo"
                    />
                </div>
                <div className="report-print-identity">
                    <p className="report-print-kicker">Official shop report</p>
                    <h1>{shopName}</h1>
                    <p className="report-print-branch">{branchName}</p>
                </div>
            </div>
            <div className="report-print-title-row">
                <h2>{title}</h2>
                <p className="report-print-confidential">Internal use</p>
            </div>
            <dl>
                <div>
                    <dt>Date range</dt>
                    <dd>{startDate} to {endDate}</dd>
                </div>
                <div>
                    <dt>Generated</dt>
                    <dd>{generatedAt} (Asia/Manila)</dd>
                </div>
                <div>
                    <dt>Prepared by</dt>
                    <dd>{generatedBy}</dd>
                </div>
            </dl>
        </div>
    );
};

export const PrintReportFooter: React.FC = () => (
    <div className="report-print-footer hidden print:block" aria-hidden="true">
        <img src="/demoshop_logo.png" alt="" className="report-print-footer-logo" />
        <span>DemoShop&apos;s Barbershop • Precision &amp; Tradition • Confidential</span>
    </div>
);

export default PrintReportHeader;
