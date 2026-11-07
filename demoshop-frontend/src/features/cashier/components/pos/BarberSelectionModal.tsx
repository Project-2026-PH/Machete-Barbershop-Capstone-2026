import React, { useEffect, useState, useCallback } from 'react';
import { Clock, Users, X } from 'lucide-react';
import { fetchPublicBarbers } from '../../services/cashier-catalog.service';
import { useAuth } from '@/components/auth/AuthContext';

interface BarberInfo {
    id: string;
    name: string;
    etaMinutes: number;
    isOffToday?: boolean;
    isOnlineBookingEnabled?: boolean;
    isAvailableForWalkins?: boolean;
    status?: string;
    statusLabel?: string;
}

interface BarberSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { customerName: string; reservationCode?: string; preferredBarberId: string; assignedBarber: BarberInfo | null | undefined }) => void;
    initialData?: {
        customerName?: string;
        preferredBarber?: string | null;
        reservationCode?: string;
        status?: string;
    } | null;
}

const BarberSelectionModal: React.FC<BarberSelectionModalProps> = ({ isOpen, onClose, onConfirm, initialData }) => {
    const { user } = useAuth();
    const branchId = Number((user as any)?.branch_id);
    const [customerName, setCustomerName] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [reservationCode, setReservationCode] = useState('');
    const [preferredBarberId, setPreferredBarberId] = useState('');
    const [barbers, setBarbers] = useState<BarberInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchBarbers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchPublicBarbers(Number.isInteger(branchId) && branchId > 0 ? branchId : undefined);
            const mapped = Array.isArray(response.data)
                ? response.data.map((barber: any) => ({
                    id: String(barber.barber_id ?? barber.id),
                    name: barber.name || `${barber.first_name || ''} ${barber.last_name || ''}`.trim(),
                    etaMinutes: Number(barber.eta_minutes ?? barber.etaMinutes ?? 0),
                    isOffToday: Boolean(barber.is_off_today),
                    isOnlineBookingEnabled: Boolean(barber.is_online_booking_enabled ?? barber.online_booking_enabled),
                    isAvailableForWalkins: barber.is_available_for_walkins !== false && !barber.is_off_today,
                    status: barber.status,
                    statusLabel: barber.walkin_status || barber.status_label || (barber.is_off_today ? 'Off Duty' : 'Available for Walk-ins'),
                })).filter((barber: BarberInfo) => Number.isSafeInteger(Number(barber.id)))
                : [];
            setBarbers(mapped);
        } catch (error) {
            console.error('Failed to fetch barbers', error);
            setBarbers([]);
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        if (!isOpen) return;

        document.body.style.overflow = 'hidden';
        setCustomerName(initialData?.customerName || '');
        setNameError(null);
        setReservationCode(initialData?.reservationCode || '');
        setPreferredBarberId(initialData?.preferredBarber || '');
        void fetchBarbers();

        const handleRefresh = () => {
            void fetchBarbers();
        };

        window.addEventListener('demoshop:barber-status-changed', handleRefresh);
        window.addEventListener('demoshop:queue-changed', handleRefresh);

        const intervalId = setInterval(() => {
            void fetchBarbers();
        }, 30000);

        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('demoshop:barber-status-changed', handleRefresh);
            window.removeEventListener('demoshop:queue-changed', handleRefresh);
            clearInterval(intervalId);
        };
    }, [isOpen, initialData, fetchBarbers]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const normalizedName = customerName.trim();
        if (normalizedName.length < 2) {
            setNameError('Enter a customer name or nickname (at least 2 characters).');
            return;
        }
        if (barbers.length === 0) return;

        const assignedBarber = preferredBarberId
            ? barbers.find(barber => barber.id === preferredBarberId)
            : null;

        onConfirm({
            customerName: normalizedName,
            reservationCode: reservationCode.trim().toUpperCase() || undefined,
            preferredBarberId,
            assignedBarber,
        });
    };

    if (!isOpen) return null;
    const selectedBarber = barbers.find(barber => barber.id === preferredBarberId);
    const nameIsValid = customerName.trim().length >= 2;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 transform-gpu will-change-transform animate-fade-in">
            <div className="relative w-full max-w-md rounded-xl border border-gold/30 bg-charcoal p-6 shadow-2xl transform-gpu will-change-transform">
                <button type="button" onClick={onClose} className="absolute right-4 top-4 text-ivory-dim transition-colors hover:text-white"><X className="h-5 w-5" /></button>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Step 1 • customer details</p>
                <h2 className="mb-6 mt-1 flex items-center gap-2 text-xl font-bold text-ivory"><Users className="h-5 w-5 text-gold" /> {initialData?.status && initialData.status !== 'NEW' ? 'Update details' : 'Start new order'}</h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="mb-1 block text-sm text-ivory-dim" htmlFor="cashier-customer-name">Customer name or nickname <span className="text-gold">*</span></label>
                        <input
                            id="cashier-customer-name"
                            type="text"
                            name="customerName"
                            value={customerName}
                            onChange={(event) => { setCustomerName(event.target.value); setNameError(null); }}
                            placeholder="e.g. Juan, Mika, Juan Dela Cruz"
                            minLength={2}
                            maxLength={120}
                            required
                            autoFocus
                            className="w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-ivory transition-colors focus:border-gold/50 focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-ivory-dim">Use the name the customer will recognize when called.</p>
                        {nameError && <p className="mt-1 text-xs text-red-300">{nameError}</p>}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-ivory-dim" htmlFor="cashier-reservation-code">Existing reservation code <span className="text-xs">(optional)</span></label>
                        <input
                            id="cashier-reservation-code"
                            type="text"
                            value={reservationCode}
                            onChange={(event) => setReservationCode(event.target.value.toUpperCase())}
                            placeholder="e.g. MCH-0042"
                            maxLength={14}
                            className="w-full rounded border border-white/10 bg-charcoal-light px-3 py-2 text-ivory transition-colors focus:border-gold/50 focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-ivory-dim">Use the booking code to check in an existing reservation.</p>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-ivory-dim" htmlFor="cashier-barber">Preferred barber</label>
                        {loading ? <div className="text-sm text-ivory-dim">Loading available barbers…</div> : barbers.length === 0 ? <div className="text-sm text-red-300">No active barbers are available for this branch.</div> : (
                            <select id="cashier-barber" value={preferredBarberId} onChange={(event) => setPreferredBarberId(event.target.value)} className="w-full appearance-none rounded border border-white/10 bg-charcoal-light px-3 py-2 text-ivory transition-colors focus:border-gold/50 focus:outline-none">
                                <option value="">No preference (auto-assign by SECT)</option>
                                {barbers.map(barber => {
                                    const isAvailableForWalkin = barber.isAvailableForWalkins !== false && !barber.isOffToday;
                                    const statusText = isAvailableForWalkin ? 'Available for Walk-ins' : (barber.statusLabel || barber.status || 'Off Duty');
                                    return (
                                        <option key={barber.id} value={barber.id}>
                                            {barber.name} • {statusText} ({barber.etaMinutes} mins wait)
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                    </div>

                    <div className="mt-4 flex gap-3 rounded-lg border border-white/5 bg-charcoal-lighter p-4">
                        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                        <div className="text-sm text-ivory">
                            {preferredBarberId && selectedBarber ? (
                                <>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-gold">{selectedBarber.name}</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                            Available for Walk-ins
                                        </span>
                                    </div>
                                    <span className="text-xs text-ivory-dim">
                                        Ready for in-shop queue assignment with an estimated wait of <strong className="text-ivory font-bold">{selectedBarber.etaMinutes} mins</strong>.
                                    </span>
                                </>
                            ) : (
                                <><span className="font-semibold">Shortest wait assignment (SECT)</span><br /><span className="mt-1 block text-xs text-ivory-dim">The server will automatically assign the barber with the shortest current wait time, or present a choice if there is a tie.</span></>
                            )}
                        </div>
                    </div>

                    <button type="submit" disabled={loading || barbers.length === 0 || !nameIsValid} className="mt-6 w-full rounded bg-gold py-3 font-bold uppercase tracking-widest text-charcoal transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50">
                        {loading ? 'Loading…' : 'Confirm & choose services'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default BarberSelectionModal;
