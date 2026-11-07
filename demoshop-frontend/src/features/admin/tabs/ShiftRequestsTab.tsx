import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Clock, ArrowLeftRight, CheckCircle2, XCircle, AlertCircle, RefreshCw, 
    Calendar, User, Filter, MessageSquare, Check, X, ShieldCheck, Sparkles, AlertTriangle, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import Portal from '@/components/common/Portal';
import { barberService, BarberShiftRequestData } from '@/features/barber/services/barber.service';
import { supabase } from '@/config/supabaseClient';

export const ShiftRequestsTab: React.FC = () => {
    const [requests, setRequests] = useState<BarberShiftRequestData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isClearing, setIsClearing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'swap' | 'time_off'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<BarberShiftRequestData | null>(null);
    const [reviewAction, setReviewAction] = useState<'approve' | 'decline' | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchShiftRequests = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const data = await barberService.getAllShiftRequests();
            setRequests(data || []);
        } catch (err) {
            console.error('Failed to load shift requests:', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchShiftRequests();

        // 1. Listen for custom frontend shift request events
        const handleShiftEvent = () => {
            fetchShiftRequests(true);
        };
        window.addEventListener('demoshop:shift-request-changed', handleShiftEvent);
        window.addEventListener('demoshop:notifications-changed', handleShiftEvent);

        // 2. Supabase Realtime subscription on shift requests table
        const channel = supabase
            .channel('shift-requests-realtime-admin')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'barber_shift_requests' },
                () => { fetchShiftRequests(true); }
            )
            .subscribe();

        return () => {
            window.removeEventListener('demoshop:shift-request-changed', handleShiftEvent);
            window.removeEventListener('demoshop:notifications-changed', handleShiftEvent);
            void supabase.removeChannel(channel).catch(() => {});
        };
    }, [fetchShiftRequests]);

    const handleClearAll = async () => {
        if (!window.confirm('Are you sure you want to clear all shift requests? This will reset all pending, approved, and declined requests for testing.')) {
            return;
        }
        setIsClearing(true);
        try {
            await barberService.clearAllShiftRequests();
            showToast('All shift requests have been cleared.');
            fetchShiftRequests();
        } catch (err) {
            console.error('Failed to clear shift requests:', err);
        } finally {
            setIsClearing(false);
        }
    };

    const handleOpenReviewModal = (req: BarberShiftRequestData, action: 'approve' | 'decline') => {
        setSelectedRequest(req);
        setReviewAction(action);
        setAdminNotes('');
    };

    const handleCloseReviewModal = () => {
        setSelectedRequest(null);
        setReviewAction(null);
        setAdminNotes('');
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRequest || !reviewAction) return;

        setIsSubmittingReview(true);
        try {
            await barberService.reviewShiftRequest(
                selectedRequest.id,
                reviewAction,
                adminNotes.trim() || undefined
            );

            const label = reviewAction === 'approve' ? 'approved' : 'declined';
            showToast(`Shift request for ${selectedRequest.target_barber_name || 'barber'} successfully ${label}.`);
            handleCloseReviewModal();
            fetchShiftRequests();
        } catch (err: any) {
            console.error('Failed to review shift request:', err);
            alert(err?.response?.data?.error || err?.message || 'Failed to submit review.');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const filteredRequests = requests.filter(req => {
        if (statusFilter !== 'all' && req.status !== statusFilter) return false;
        if (typeFilter !== 'all' && req.request_type !== typeFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const barberMatch = (req.target_barber_name || '').toLowerCase().includes(q) || ((req as any).barber_name || '').toLowerCase().includes(q);
            const dateMatch = req.shift_date.toLowerCase().includes(q);
            const reasonMatch = req.reason.toLowerCase().includes(q);
            if (!barberMatch && !dateMatch && !reasonMatch) return false;
        }
        return true;
    });

    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const approvedCount = requests.filter(r => r.status === 'approved').length;
    const declinedCount = requests.filter(r => r.status === 'declined').length;

    return (
        <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
            {/* Custom Toast Alert */}
            {toastMessage && (
                <Portal>
                    <div className="fixed top-4 right-4 bg-charcoal-light border border-gold text-gold px-5 py-3 rounded-sm shadow-2xl z-[100] flex items-center gap-3 animate-fade-in">
                        <Sparkles className="w-5 h-5 text-gold flex-shrink-0" />
                        <span className="text-sm font-semibold">{toastMessage}</span>
                    </div>
                </Portal>
            )}

            {/* Top Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-charcoal border border-amber-500/30 p-3 rounded-sm shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block mb-1">
                                Pending Approval
                            </span>
                            <span className="text-2xl font-serif font-bold text-ivory">
                                {pendingCount}
                            </span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                <div className="bg-charcoal border border-emerald-500/30 p-3 rounded-sm shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 block mb-1">
                                Approved Schedule
                            </span>
                            <span className="text-2xl font-serif font-bold text-ivory">
                                {approvedCount}
                            </span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                <div className="bg-charcoal border border-rose-500/30 p-3 rounded-sm shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400 block mb-1">
                                Declined Requests
                            </span>
                            <span className="text-2xl font-serif font-bold text-ivory">
                                {declinedCount}
                            </span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <XCircle className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                <div className="bg-charcoal border border-white/10 p-3 rounded-sm shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-ivory-dim block mb-1">
                                Total Inquiries
                            </span>
                            <span className="text-2xl font-serif font-bold text-ivory">
                                {requests.length}
                            </span>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-ivory">
                            <Calendar className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter & Controls Bar */}
            <div className="bg-charcoal-light border border-white/10 p-3 rounded-sm flex flex-col md:flex-row gap-3 items-center justify-between shadow-sm">
                {/* Search */}
                <div className="w-full md:w-72">
                    <input
                        type="text"
                        placeholder="Search barber, date, or reason..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-charcoal border border-white/10 rounded-sm px-3.5 py-2 text-xs text-ivory placeholder-white/30 focus:border-gold focus:outline-none"
                    />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
                    {/* Status Filter */}
                    <div className="flex bg-charcoal p-1 rounded-sm border border-white/10 text-xs">
                        {(['all', 'pending', 'approved', 'declined'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-xs font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer ${
                                    statusFilter === s
                                        ? 'bg-gold text-charcoal shadow-sm'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                {s === 'all' ? 'All Status' : s}
                                {s === 'pending' && pendingCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[8px] bg-charcoal text-gold font-bold">
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Refresh & Clear Actions */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => { void fetchShiftRequests(); }}
                            disabled={isLoading}
                            className="p-2 bg-white/5 hover:bg-gold/15 border border-white/10 hover:border-gold/40 text-ivory-dim hover:text-gold rounded-sm transition-all cursor-pointer"
                            title="Refresh list"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={handleClearAll}
                            disabled={isClearing || requests.length === 0}
                            className="p-2 bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/40 text-ivory-dim hover:text-rose-400 rounded-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Clear all shift requests"
                        >
                            <Trash2 className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-24 sm:pb-28 lg:pb-6">
            {/* List of Requests */}
            {isLoading ? (
                <div className="bg-charcoal border border-white/10 p-12 text-center rounded-sm space-y-3">
                    <RefreshCw className="w-6 h-6 text-gold animate-spin mx-auto" />
                    <p className="text-xs text-ivory-dim">Loading shift schedule change inquiries...</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="bg-charcoal border border-white/10 p-12 text-center rounded-sm space-y-3">
                    <Calendar className="w-10 h-10 text-white/20 mx-auto" />
                    <h4 className="text-sm font-bold text-ivory">No Shift Requests Found</h4>
                    <p className="text-xs text-ivory-dim max-w-md mx-auto">
                        There are currently no shift swap or time off requests matching your active filter criteria.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredRequests.map(req => {
                        const isPending = req.status === 'pending';
                        const isApproved = req.status === 'approved';
                        const isDeclined = req.status === 'declined';
                        const barberName = (req as any).barber_name || 'Barber';

                        return (
                            <div
                                key={req.id}
                                className={`bg-charcoal-light border rounded-sm p-4 transition-all duration-200 ease-in-out shadow-md relative overflow-hidden ${
                                    isPending
                                        ? 'border-amber-500/40 hover:border-amber-500/70'
                                        : isApproved
                                            ? 'border-emerald-500/30'
                                            : 'border-white/10 opacity-75 hover:opacity-100'
                                }`}
                            >
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    {/* Left Details */}
                                    <div className="space-y-3 flex-1">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="font-bold text-ivory text-sm flex items-center gap-2">
                                                <User className="w-4 h-4 text-gold" />
                                                {barberName}
                                            </span>

                                            {/* Type Badge */}
                                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                                                req.request_type === 'swap'
                                                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                                    : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                            }`}>
                                                {req.request_type === 'swap' ? (
                                                    <>
                                                        <ArrowLeftRight className="w-3 h-3" />
                                                        Shift Swap
                                                    </>
                                                ) : (
                                                    <>
                                                        <Clock className="w-3 h-3" />
                                                        Time Off
                                                    </>
                                                )}
                                            </span>

                                            {/* Status Badge */}
                                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                                isPending
                                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
                                                    : isApproved
                                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                            }`}>
                                                {req.status}
                                            </span>

                                            {/* Reference ID Badge */}
                                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-gold/10 text-gold border border-gold/25">
                                                Ref: #{req.id} - {req.shift_date}
                                            </span>

                                            <span className="text-[10px] font-mono text-white/30 ml-auto">
                                                Filed: {new Date(req.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-charcoal p-3.5 rounded-sm border border-white/5">
                                            <div>
                                                <span className="text-[9px] uppercase font-bold text-ivory-dim tracking-wider block">
                                                    Target Shift Date
                                                </span>
                                                <span className="font-bold text-gold font-mono text-xs">
                                                    {req.shift_date}
                                                </span>
                                            </div>

                                            {req.target_barber_name && (
                                                <div>
                                                    <span className="text-[9px] uppercase font-bold text-ivory-dim tracking-wider block">
                                                        Swap Partner
                                                    </span>
                                                    <span className="text-ivory font-semibold">
                                                        {req.target_barber_name}
                                                    </span>
                                                </div>
                                            )}

                                            {req.target_date && (
                                                <div>
                                                    <span className="text-[9px] uppercase font-bold text-ivory-dim tracking-wider block">
                                                        Return Shift Date
                                                    </span>
                                                    <span className="text-ivory font-mono">
                                                        {req.target_date}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-xs space-y-1">
                                            <span className="text-[9px] uppercase font-bold text-ivory-dim tracking-wider block">
                                                Stated Reason / Notes
                                            </span>
                                            <p className="text-ivory-dim italic bg-white/[0.02] p-2.5 rounded-sm border border-white/5">
                                                "{req.reason}"
                                            </p>
                                        </div>

                                        {req.admin_notes && (
                                            <div className="text-xs space-y-1 bg-charcoal p-2.5 rounded-sm border border-white/10">
                                                <span className="text-[9px] uppercase font-bold text-gold tracking-wider block">
                                                    Admin Review Remark
                                                </span>
                                                <p className="text-ivory italic">
                                                    "{req.admin_notes}"
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons for Pending Requests */}
                                    {isPending && (
                                        <div className="flex flex-row lg:flex-col gap-2.5 justify-end lg:min-w-[140px] pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-4">
                                            <Button
                                                type="button"
                                                variant="primary"
                                                onClick={() => handleOpenReviewModal(req, 'approve')}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-ivory font-bold text-xs flex-1 lg:w-full flex items-center justify-center gap-1.5 shadow-sm"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Approve Shift</span>
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => handleOpenReviewModal(req, 'decline')}
                                                className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 font-bold text-xs flex-1 lg:w-full flex items-center justify-center gap-1.5"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                <span>Decline</span>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            </div>

            {/* Approval / Decline Dialog Modal */}
            {selectedRequest && reviewAction && (
                <Modal sidebarOffset
                    isOpen={true}
                    onClose={handleCloseReviewModal}
                    title={reviewAction === 'approve' ? 'Approve Shift Request' : 'Decline Shift Request'}
                    size="md"
                >
                    <form onSubmit={handleSubmitReview} className="space-y-4">
                        <div className={`p-4 rounded-sm border ${
                            reviewAction === 'approve'
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-rose-500/10 border-rose-500/30'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {reviewAction === 'approve' ? (
                                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                                )}
                                <h4 className="text-sm font-bold text-ivory">
                                    {reviewAction === 'approve'
                                        ? `Confirm Approval for ${(selectedRequest as any).barber_name || 'Barber'}`
                                        : `Confirm Decline for ${(selectedRequest as any).barber_name || 'Barber'}`}
                                </h4>
                            </div>
                            <p className="text-xs text-ivory-dim leading-relaxed">
                                {reviewAction === 'approve'
                                    ? `Approving this request will update the branch shift schedule for ${selectedRequest.shift_date} and notify ${(selectedRequest as any).barber_name || 'the barber'} immediately.`
                                    : `Declining this request will inform ${(selectedRequest as any).barber_name || 'the barber'} so they can acknowledge and submit a revised request if needed.`}
                            </p>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gold block mb-1">
                                Admin Remarks / Feedback (Optional)
                            </label>
                            <textarea
                                rows={3}
                                placeholder={
                                    reviewAction === 'approve'
                                        ? 'e.g. Approved. Shift covered by Dave. Roster adjusted.'
                                        : 'e.g. Peak Saturday shift coverage required. Please coordinate with team.'
                                }
                                value={adminNotes}
                                onChange={e => setAdminNotes(e.target.value)}
                                className="w-full bg-charcoal border border-white/10 rounded-sm p-3 text-xs text-ivory placeholder-white/20 focus:border-gold focus:outline-none resize-none shadow-inner"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCloseReviewModal}
                                disabled={isSubmittingReview}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={isSubmittingReview}
                                className={`text-ivory font-bold text-xs flex items-center gap-1.5 ${
                                    reviewAction === 'approve'
                                        ? 'bg-emerald-600 hover:bg-emerald-500'
                                        : 'bg-rose-600 hover:bg-rose-500'
                                }`}
                            >
                                {reviewAction === 'approve' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                <span>{isSubmittingReview ? 'Submitting...' : reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Decline'}</span>
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default ShiftRequestsTab;
