import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface GeneralSettingsProps {
  initialValues: {
    shopName: string;
    contactEmail: string;
    physicalAddress: string;
  };
  onSave: (values: { shopName: string; contactEmail: string; physicalAddress: string }) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const GeneralSettingsSection: React.FC<GeneralSettingsProps> = ({
  initialValues,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [shopName, setShopName] = useState(initialValues.shopName);
  const [contactEmail, setContactEmail] = useState(initialValues.contactEmail);
  const [physicalAddress, setPhysicalAddress] = useState(initialValues.physicalAddress);
  const [error, setError] = useState<string | null>(null);

  const prevInitialRef = useRef(initialValues);

  useEffect(() => {
    if (
      prevInitialRef.current.shopName !== initialValues.shopName ||
      prevInitialRef.current.contactEmail !== initialValues.contactEmail ||
      prevInitialRef.current.physicalAddress !== initialValues.physicalAddress
    ) {
      setShopName(initialValues.shopName);
      setContactEmail(initialValues.contactEmail);
      setPhysicalAddress(initialValues.physicalAddress);
      prevInitialRef.current = initialValues;
    }
  }, [initialValues.shopName, initialValues.contactEmail, initialValues.physicalAddress]);

  const isDirty =
    shopName !== initialValues.shopName ||
    contactEmail !== initialValues.contactEmail ||
    physicalAddress !== initialValues.physicalAddress;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleReset = () => {
    setShopName(initialValues.shopName);
    setContactEmail(initialValues.contactEmail);
    setPhysicalAddress(initialValues.physicalAddress);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = shopName.trim();
    const trimmedEmail = contactEmail.trim();
    const trimmedAddress = physicalAddress.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setError('Shop Name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Shop Name must be 100 characters or less.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please provide a valid contact email address.');
      return;
    }
    if (!trimmedAddress || trimmedAddress.length < 5) {
      setError('Physical address is required (at least 5 characters).');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please provide a valid contact email address.');
      return;
    }
    if (!trimmedAddress) {
      setError('Physical address is required.');
      return;
    }

    await onSave({
      shopName: trimmedName,
      contactEmail: trimmedEmail,
      physicalAddress: trimmedAddress,
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-gold" /> General Shop Settings
        </h3>
        <p className="text-xs text-ivory-dim mt-1">
          Configure authoritative storefront information used across public headers, booking, and footer.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Shop Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. SampleBranch Branch"
              className="w-full bg-charcoal border border-white/15 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none transition-colors rounded"
            />
            <p className="text-[10px] text-ivory-dim mt-1">
              Authoritative business name displayed across public branding and customer receipts.
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Contact Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g. portfolio@example.invalid"
              className="w-full bg-charcoal border border-white/15 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none transition-colors rounded"
            />
            <p className="text-[10px] text-ivory-dim mt-1">
              Public inquiry address shown in footer and customer correspondence.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
            Physical Address <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={3}
            value={physicalAddress}
            onChange={(e) => setPhysicalAddress(e.target.value)}
            placeholder="e.g. Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan"
            className="w-full bg-charcoal border border-white/15 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none transition-colors rounded resize-none"
          />
          <p className="text-[10px] text-ivory-dim mt-1">
            Authoritative shop location used by Google Maps, footer, and reservation directions.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory-dim hover:text-white min-h-[44px] w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty || isSaving}
            className="flex items-center justify-center gap-2 px-6 min-h-[44px] w-full sm:w-auto text-xs sm:text-sm"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Changes...' : 'Save General Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
};
