import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Clock, UserX, Building2, RefreshCw } from 'lucide-react';

export type EmergencyCancellationScope = 'barber_unavailability' | 'time_window' | 'shop_closure';

interface EmergencyCancelModalProps {

  barbers: Array<{ barber_id: number; name: string }>;
  branchId: number;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

export const EmergencyCancelModal: React.FC<EmergencyCancelModalProps> = ({
  barbers,
  branchId,
  onClose,
  onSuccess,
}) => {
  const [cancellationType, setCancellationType] = useState<EmergencyCancellationScope>('barber_unavailability');
  const [selectedBarberId, setSelectedBarberId] = useState<number | ''>(
    barbers[0]?.barber_id || ''
  );
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('21:00');
  const [reason, setReason] = useState<string>('Unforeseen barber emergency / shop disruption');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for the emergency cancellation.');
      return;
    }
    if (cancellationType === 'barber_unavailability' && !selectedBarberId) {
      setError('Please select an unavailable barber.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/queue/emergency-cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          branchId,
          cancellationType,
          barberId: selectedBarberId ? Number(selectedBarberId) : undefined,
          startTime: cancellationType === 'time_window' ? startTime : undefined,
          endTime: cancellationType === 'time_window' ? endTime : undefined,
          reason,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to trigger emergency cancellation');
      }

      const result = await response.json();
      onSuccess(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred triggering emergency cancellation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-charcoal border border-red-800/60 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-6 relative text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-950/60 text-red-400 rounded-lg border border-red-800/50">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-400 uppercase tracking-wider">
                Emergency Cancellation Trigger
              </h3>
              <p className="text-xs text-gray-400">
                POS / Cashier Disruption Management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Disruption Type */}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-300 mb-2">
              Select Disruption Scope
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCancellationType('barber_unavailability')}
                className={`p-3 rounded border text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all ${
                  cancellationType === 'barber_unavailability'
                    ? 'border-red-500 bg-red-950/40 text-red-300'
                    : 'border-white/10 bg-charcoal-light/40 text-gray-400 hover:border-white/20'
                }`}
              >
                <UserX size={18} />
                Barber
              </button>

              <button
                type="button"
                onClick={() => setCancellationType('time_window')}
                className={`p-3 rounded border text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all ${
                  cancellationType === 'time_window'
                    ? 'border-red-500 bg-red-950/40 text-red-300'
                    : 'border-white/10 bg-charcoal-light/40 text-gray-400 hover:border-white/20'
                }`}
              >
                <Clock size={18} />
                Window
              </button>

              <button
                type="button"
                onClick={() => setCancellationType('shop_closure')}
                className={`p-3 rounded border text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all ${
                  cancellationType === 'shop_closure'
                    ? 'border-red-500 bg-red-950/40 text-red-300'
                    : 'border-white/10 bg-charcoal-light/40 text-gray-400 hover:border-white/20'
                }`}
              >
                <Building2 size={18} />
                Closure
              </button>
            </div>
          </div>

          {/* Barber Selection */}
          {(cancellationType === 'barber_unavailability' || cancellationType === 'time_window') && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Affected Barber {cancellationType === 'time_window' && '(Optional)'}
              </label>
              <select
                value={selectedBarberId}
                onChange={(e) => setSelectedBarberId(e.target.value ? Number(e.target.value) : '')}
                className="w-full p-2.5 bg-charcoal-light border border-white/10 rounded text-sm text-white focus:border-red-500 outline-none"
              >
                <option value="">-- All Barbers --</option>
                {barbers.map((b) => (
                  <option key={b.barber_id} value={b.barber_id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time Window Selection */}
          {cancellationType === 'time_window' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full p-2.5 bg-charcoal-light border border-white/10 rounded text-sm text-white focus:border-red-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full p-2.5 bg-charcoal-light border border-white/10 rounded text-sm text-white focus:border-red-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Disruption Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full p-2.5 bg-charcoal-light border border-white/10 rounded text-sm text-white focus:border-red-500 outline-none"
              placeholder="Provide context for affected customers..."
            />
          </div>

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/40 text-red-400 text-xs rounded">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded text-xs uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <AlertTriangle size={16} />}
              Trigger Disruption
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
