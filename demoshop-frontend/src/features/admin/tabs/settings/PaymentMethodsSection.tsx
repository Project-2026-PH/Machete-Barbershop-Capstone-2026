import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard, ShieldCheck, QrCode, Upload, Trash2, Save, RotateCcw,
  AlertCircle, Info, Loader2, CheckCircle2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import type { PaymentMethodConfig } from '@demoshop/shared-types';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { PaymentProviderLogo } from '@/features/customer/components/payment';

interface PaymentMethodsProps {
  initialMethods: PaymentMethodConfig[];
  onSave: (methods: PaymentMethodConfig[]) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const CANONICAL_METHOD_NAMES: Record<string, string> = {
  gcash: 'Gcash',
  maya: 'Maya/ Paymaya',
  maribank: 'MariBank',
  gotyme: 'GoTyme',
};

const getMethodId = (m: PaymentMethodConfig): string => String(m.id || m.key || '');

export const PaymentMethodsSection: React.FC<PaymentMethodsProps> = ({
  initialMethods,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(initialMethods);

  // Derive initial shared source
  const getInitialShared = (list: PaymentMethodConfig[]) => {
    return (
      list.find((m) => m.qrImageUrl) ||
      list.find((m) => m.accountNumber) ||
      list.find((m) => m.id === 'gcash') ||
      list[0]
    );
  };

  const initialSharedSource = getInitialShared(initialMethods);

  const [sharedAccountName, setSharedAccountName] = useState(() => initialSharedSource?.accountName || initialSharedSource?.merchantName || "DEMOSHOP'S BARBERSHOP");
  const [sharedAccountNumber, setSharedAccountNumber] = useState(() => initialSharedSource?.accountNumber || '');
  const [sharedInstructions, setSharedInstructions] = useState(() => initialSharedSource?.instructions || 'Scan the QR code and provide the transaction reference number.');
  const [sharedQrUrl, setSharedQrUrl] = useState<string | null>(() => initialSharedSource?.qrImageUrl || null);
  const [pendingSharedQrFile, setPendingSharedQrFile] = useState<File | null>(null);
  const [pendingSharedQrPreview, setPendingSharedQrPreview] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharedFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMethods(initialMethods);
    const source = getInitialShared(initialMethods);
    if (source) {
      setSharedAccountName(source.accountName || source.merchantName || "DEMOSHOP'S BARBERSHOP");
      setSharedAccountNumber(source.accountNumber || '');
      setSharedInstructions(source.instructions || 'Scan the QR code and provide the transaction reference number.');
      setSharedQrUrl(source.qrImageUrl || null);
    }
    if (pendingSharedQrPreview) {
      URL.revokeObjectURL(pendingSharedQrPreview);
    }
    setPendingSharedQrFile(null);
    setPendingSharedQrPreview(null);
  }, [initialMethods]);

  const isDirty =
    JSON.stringify(methods) !== JSON.stringify(initialMethods) ||
    pendingSharedQrFile !== null ||
    sharedAccountName !== (initialSharedSource?.accountName || initialSharedSource?.merchantName || "DEMOSHOP'S BARBERSHOP") ||
    sharedAccountNumber !== (initialSharedSource?.accountNumber || '') ||
    sharedInstructions !== (initialSharedSource?.instructions || 'Scan the QR code and provide the transaction reference number.') ||
    sharedQrUrl !== (initialSharedSource?.qrImageUrl || null);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleToggleEnabled = (targetId: string) => {
    if (!targetId) return;
    setMethods((prev) =>
      prev.map((m) => {
        const id = getMethodId(m);
        if (id === targetId) {
          if (m.isPrimary || id === 'cash') {
            return m; // Cash is protected
          }
          return { ...m, enabled: !m.enabled };
        }
        return m;
      })
    );
  };

  const handleSharedImageSelect = (file: File | undefined) => {
    if (!file) return;
    setError(null);

    // Validate MIME type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a valid image file (JPEG, PNG, or WebP).');
      return;
    }

    // Validate file size: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5MB.');
      return;
    }

    if (pendingSharedQrPreview) {
      URL.revokeObjectURL(pendingSharedQrPreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingSharedQrFile(file);
    setPendingSharedQrPreview(previewUrl);
  };

  const handleConfirmRemoveQr = () => {
    if (pendingSharedQrPreview) {
      URL.revokeObjectURL(pendingSharedQrPreview);
    }
    setPendingSharedQrFile(null);
    setPendingSharedQrPreview(null);
    setSharedQrUrl(null);
    setIsDeleteModalOpen(false);
  };

  const handleReset = () => {
    if (pendingSharedQrPreview) {
      URL.revokeObjectURL(pendingSharedQrPreview);
    }
    setPendingSharedQrFile(null);
    setPendingSharedQrPreview(null);
    setMethods(initialMethods);
    const source = getInitialShared(initialMethods);
    if (source) {
      setSharedAccountName(source.accountName || source.merchantName || "DEMOSHOP'S BARBERSHOP");
      setSharedAccountNumber(source.accountNumber || '');
      setSharedInstructions(source.instructions || 'Scan the QR code and provide the transaction reference number.');
      setSharedQrUrl(source.qrImageUrl || null);
    }
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUploading(true);

    try {
      let finalQrUrl = sharedQrUrl;
      if (pendingSharedQrFile) {
        finalQrUrl = await uploadShopMedia(pendingSharedQrFile, 'payments');
      }

      // Propagate shared QR and account details across all digital methods
      const updatedMethods = methods.map((m) => {
        const id = getMethodId(m).toLowerCase();
        const isCash = id === 'cash' || m.isPrimary;
        const isCard = id === 'card';
        const canonicalName = CANONICAL_METHOD_NAMES[id];
        if (isCash || isCard) return { ...m, name: canonicalName || m.name };

        return {
          ...m,
          name: canonicalName || m.name,
          accountName: sharedAccountName,
          merchantName: sharedAccountName,
          accountNumber: sharedAccountNumber,
          instructions: sharedInstructions,
          qrImageUrl: finalQrUrl,
        };
      });

      if (pendingSharedQrPreview) {
        URL.revokeObjectURL(pendingSharedQrPreview);
      }
      setPendingSharedQrFile(null);
      setPendingSharedQrPreview(null);
      setSharedQrUrl(finalQrUrl);

      await onSave(updatedMethods);
    } catch (err: any) {
      console.error('Failed to save payment methods:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to save payment methods.');
    } finally {
      setIsUploading(false);
    }
  };

  const activeQrPreview = pendingSharedQrPreview || sharedQrUrl;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-gold" /> Payment Methods & Tender Channels
          </h3>
          <p className="text-xs text-ivory-dim mt-1">
            Configure your shop receiving QR and manage accepted payment channels.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-gold/10 border border-gold/30 text-gold text-xs self-start sm:self-auto">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-wide uppercase">System Admin Governed</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Master Shared Receiving Account & QR (Upload Once) */}
        <div className="bg-[#181818] border border-gold/40 rounded-lg p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gold/20 text-gold border border-gold/40 uppercase">
                  Shared QR &amp; Account
                </span>
                <h4 className="text-base font-serif font-bold text-ivory">
                  Shop Receiving Account (InstaPay / QR Ph)
                </h4>
              </div>
              <p className="text-xs text-ivory-dim mt-1">
                Upload your official QR code once. All enabled digital methods (GCash, Maya, MariBank, GoTyme) share this QR code and account number.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            {/* Account Details Inputs */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gold font-bold mb-1">
                  Account / Merchant Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sharedAccountName}
                  onChange={(e) => setSharedAccountName(e.target.value)}
                  placeholder="e.g. AY*A IS***L P."
                  className="w-full bg-charcoal border border-white/15 px-3 py-2 text-xs text-ivory rounded focus:border-gold focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gold font-bold mb-1">
                  Account / Mobile Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sharedAccountNumber}
                  onChange={(e) => setSharedAccountNumber(e.target.value)}
                  placeholder="e.g. 09XX XXX XXXX"
                  className="w-full bg-charcoal border border-white/15 px-3 py-2 text-xs text-ivory rounded focus:border-gold focus:outline-none font-mono text-sm tracking-wider"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gold font-bold mb-1">
                  Payment Instructions
                </label>
                <textarea
                  rows={2}
                  value={sharedInstructions}
                  onChange={(e) => setSharedInstructions(e.target.value)}
                  placeholder="Scan the merchant QR code and enter the transaction reference number."
                  className="w-full bg-charcoal border border-white/15 px-3 py-2 text-xs text-ivory rounded focus:border-gold focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Shared QR Code Upload Panel */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] uppercase tracking-wider text-gold font-bold">
                  InstaPay / QR Ph Code Image
                </label>
                {pendingSharedQrPreview && (
                  <span className="text-[10px] text-amber-300 font-mono">
                    Preview Staged (Unsaved)
                  </span>
                )}
              </div>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={sharedFileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  handleSharedImageSelect(file);
                  e.target.value = '';
                }}
              />

              <div className="p-4 bg-charcoal/80 border border-white/10 rounded-lg flex flex-col items-center justify-center min-h-[170px]">
                {activeQrPreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={activeQrPreview}
                      alt="Shared Shop QR Code"
                      className="w-36 h-36 object-contain rounded bg-white p-2 shadow-lg border border-gold/30"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isUploading || isSaving}
                        onClick={() => sharedFileInputRef.current?.click()}
                        className="px-3 py-1.5 text-xs font-bold text-gold border border-gold/40 rounded hover:bg-gold/10 transition-colors cursor-pointer"
                      >
                        Replace QR
                      </button>
                      <button
                        type="button"
                        disabled={isUploading || isSaving}
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="px-3 py-1.5 text-xs text-red-300 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Remove QR code"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-2.5 p-4">
                    <QrCode className="w-10 h-10 text-gold/40 mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-ivory">No QR Image Uploaded</p>
                      <p className="text-[11px] text-ivory-dim mt-0.5">Upload your shop InstaPay or QR Ph code once for all methods</p>
                    </div>
                    <button
                      type="button"
                      disabled={isUploading || isSaving}
                      onClick={() => sharedFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-gold/10 border border-gold/40 text-xs text-gold font-bold hover:bg-gold/20 transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4" /> Upload QR Code
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Accepted Tender Channels (Toggles) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h4 className="text-xs font-mono uppercase tracking-[0.2em] text-ivory-dim font-bold">
              Accepted Tender Channels
            </h4>
            <span className="text-[11px] text-ivory-dim">
              Toggle payment methods to show or hide them from customer booking
            </span>
          </div>

          <div className="grid gap-2.5">
            {methods.map((method) => {
              const targetId = getMethodId(method);
              const isCash = targetId === 'cash' || method.isPrimary;
              const isDigital = !isCash && targetId !== 'card';

              return (
                <div
                  key={targetId}
                  className={`p-4 rounded-md border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    method.enabled
                      ? 'bg-white/[0.02] border-white/10 hover:border-gold/30'
                      : 'bg-charcoal/40 border-white/5 opacity-60'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-2">
                        {isDigital && (
                          <PaymentProviderLogo providerId={targetId} size="sm" />
                        )}
                        <span className="text-sm font-bold text-ivory">
                          {CANONICAL_METHOD_NAMES[targetId] || method.name}
                        </span>
                      </div>

                      {isCash ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gold/20 text-gold border border-gold/30 uppercase">
                          PRIMARY (PROTECTED)
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          method.enabled
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/10 text-ivory-dim border border-white/10'
                        }`}>
                          {method.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      )}

                      {isDigital && method.enabled && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono text-gold/90 bg-gold/10 border border-gold/20 flex items-center gap-1">
                          <Check className="w-3 h-3 text-gold" /> Uses Shared QR
                        </span>
                      )}

                      <span className="text-[10px] text-ivory-dim font-mono uppercase bg-white/5 px-2 py-0.5 rounded">
                        {method.type}
                      </span>
                    </div>

                    <p className="text-xs text-ivory-dim">{method.description}</p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    {isCash ? (
                      <span className="text-xs text-gold/80 italic font-light">Core Tender</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(targetId)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          method.enabled ? 'bg-gold' : 'bg-white/20'
                        }`}
                        title={method.enabled ? `Disable ${method.name}` : `Enable ${method.name}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-charcoal shadow ring-0 transition duration-200 ease-in-out ${
                            method.enabled ? 'translate-x-5 bg-charcoal' : 'translate-x-0 bg-white'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving || isUploading}
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory-dim hover:text-white min-h-[44px] w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty || isSaving || isUploading}
            className="flex items-center justify-center gap-2 px-6 min-h-[44px] w-full sm:w-auto text-xs sm:text-sm font-bold uppercase tracking-wider"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading QR & Saving...
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Payment Methods
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Remove QR Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Remove Shared QR Code Image?"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirmRemoveQr}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              Remove QR
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ivory-dim leading-relaxed">
          Are you sure you want to remove the shared QR code image? Without a QR code image, customers will only see the account number during checkout.
        </p>
      </Modal>
    </div>
  );
};

export default PaymentMethodsSection;
