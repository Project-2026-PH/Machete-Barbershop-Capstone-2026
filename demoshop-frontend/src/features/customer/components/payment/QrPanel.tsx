import React, { useState, memo } from 'react';
import { Copy, Check, Download, Info } from 'lucide-react';
import type { EnrichedPaymentMethod } from './PaymentMethodList';

interface QrPanelProps {
  method: EnrichedPaymentMethod;
  depositAmount: number;
}

export const QrPanel: React.FC<QrPanelProps> = memo(({
  method,
  depositAmount,
}) => {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const accountNumber = method.receiving.accountNumber;
  const accountName = method.receiving.accountName || "DEMOSHOP'S BARBERSHOP";
  const numberLabel = method.receiving.accountNumberLabel;
  const qrImage = method.receiving.qrImageUrl;

  const handleCopy = async () => {
    if (!accountNumber) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(accountNumber);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = accountNumber;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSaveQr = () => {
    if (qrImage) {
      const link = document.createElement('a');
      link.href = qrImage;
      link.download = `demoshop-${method.id}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-charcoal-light/90 border border-white/10 rounded-lg p-4 sm:p-5 space-y-4 shadow-md">
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-ivory flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gold/20 text-gold text-[10px] flex items-center justify-center font-mono">
            1
          </span>
          Scan &amp; Pay via {method.label}
        </div>
        <span className="text-xs font-mono font-bold text-gold">
          ₱{depositAmount.toFixed(2)}
        </span>
      </div>

      {/* QR Code Container */}
      <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-md">
        <div className="w-48 h-48 sm:w-52 sm:h-52 bg-white rounded-md p-3 flex items-center justify-center shadow-lg border border-gold/40 relative">
          {qrImage ? (
            <img
              src={qrImage}
              alt={`${method.label} Official QR`}
              className="w-full h-full object-contain"
            />
          ) : (
            /* QR Ph Standard Stylized Fallback Pattern */
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Payment QR Code"
            >
              <rect width="200" height="200" fill="#FFFFFF" rx="4" />
              {/* Corner position markers */}
              <rect x="20" y="20" width="45" height="45" fill="#1A1A1A" rx="3" />
              <rect x="26" y="26" width="33" height="33" fill="#FFFFFF" rx="2" />
              <rect x="32" y="32" width="21" height="21" fill="#1A1A1A" rx="1" />

              <rect x="135" y="20" width="45" height="45" fill="#1A1A1A" rx="3" />
              <rect x="141" y="26" width="33" height="33" fill="#FFFFFF" rx="2" />
              <rect x="147" y="32" width="21" height="21" fill="#1A1A1A" rx="1" />

              <rect x="20" y="135" width="45" height="45" fill="#1A1A1A" rx="3" />
              <rect x="26" y="141" width="33" height="33" fill="#FFFFFF" rx="2" />
              <rect x="32" y="147" width="21" height="21" fill="#1A1A1A" rx="1" />

              {/* Data blocks */}
              <rect x="75" y="20" width="10" height="45" fill="#1A1A1A" />
              <rect x="95" y="20" width="15" height="20" fill="#1A1A1A" />
              <rect x="115" y="25" width="10" height="35" fill="#1A1A1A" />
              <rect x="75" y="75" width="50" height="12" fill="#1A1A1A" />
              <rect x="20" y="75" width="45" height="10" fill="#1A1A1A" />
              <rect x="30" y="95" width="30" height="15" fill="#1A1A1A" />
              <rect x="140" y="75" width="40" height="10" fill="#1A1A1A" />
              <rect x="145" y="95" width="30" height="20" fill="#1A1A1A" />
              <rect x="25" y="120" width="35" height="10" fill="#1A1A1A" />
              <rect x="70" y="120" width="20" height="20" fill="#1A1A1A" />
              <rect x="100" y="120" width="30" height="10" fill="#1A1A1A" />
              <rect x="140" y="130" width="20" height="20" fill="#1A1A1A" />
              <rect x="70" y="150" width="25" height="15" fill="#1A1A1A" />
              <rect x="105" y="140" width="25" height="25" fill="#1A1A1A" />
              <rect x="70" y="175" width="40" height="10" fill="#1A1A1A" />
              <rect x="120" y="170" width="20" height="15" fill="#1A1A1A" />
              <rect x="150" y="160" width="35" height="25" fill="#1A1A1A" />

              {/* Central Badge */}
              <circle cx="100" cy="100" r="18" fill="#121212" stroke="#D4AF37" strokeWidth="2" />
              <text x="100" y="104" textAnchor="middle" fill="#D4AF37" fontSize="10" fontWeight="bold" fontFamily="serif">M</text>
            </svg>
          )}
        </div>

        {/* Recipient Details */}
        <div className="mt-3.5 text-center space-y-1 w-full max-w-xs">
          <div className="text-xs text-ivory font-medium">
            Account: <span className="text-gold font-bold">{accountName}</span>
          </div>
          {accountNumber && (
            <div className="text-xs font-mono text-ivory-dim">
              {numberLabel}: <span className="text-gold font-bold">{accountNumber}</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Save QR & Copy Number */}
        <div className="mt-3.5 flex items-center gap-2.5 w-full max-w-xs justify-center">
          <button
            type="button"
            onClick={handleSaveQr}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-ivory transition-colors cursor-pointer"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400">✓ Saved</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-gold" />
                <span>Save QR</span>
              </>
            )}
          </button>

          {accountNumber && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-ivory transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400">✓ Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gold" />
                  <span>Copy {numberLabel === 'Mobile' ? 'number' : 'acct no.'}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Tip for same-device payers */}
        <div className="mt-3 text-[11px] text-ivory-dim/80 flex items-start gap-1.5 max-w-xs text-left">
          <Info className="w-3.5 h-3.5 text-gold/70 shrink-0 mt-0.5" />
          <span>
            Paying on this device? Tap <strong>Save QR</strong>, then in your {method.label} app choose <em>Scan QR → Import from Photos / Gallery</em>.
          </span>
        </div>
      </div>
    </div>
  );
});

QrPanel.displayName = 'QrPanel';
