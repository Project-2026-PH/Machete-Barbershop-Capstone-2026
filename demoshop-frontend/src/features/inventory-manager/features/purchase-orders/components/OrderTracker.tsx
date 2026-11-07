import React from 'react';
import type { PurchaseOrder } from '../purchase-order.types';
import { formatDateTime, formatPurchaseOrderStatus } from '../../../shared/utils/formatting';

interface OrderTrackerProps {
  order: PurchaseOrder;
  onViewReceipt?: () => void;
}

type StepStatus = 'completed' | 'current' | 'upcoming' | 'rejected';

interface TrackerStep {
  id: string;
  label: string;
  status: StepStatus;
  timestamp?: string | null;
  detail?: string;
  icon: (status: StepStatus) => React.ReactNode;
}

export const OrderTracker: React.FC<OrderTrackerProps> = ({ order, onViewReceipt }) => {
  const isRejected = order.status === 'rejected';
  const isDraft = order.status === 'draft';
  const isPending = order.status === 'pending';
  const isApproved = order.status === 'approved';
  const isFulfilled = order.status === 'fulfilled';
  const hasReceipt = Boolean(order.receiptId || order.receiptImageUrl || (order.receiptImageUrls && order.receiptImageUrls.length > 0));

  // Determine status of each step:
  // Step 1: For Approval
  let step1Status: StepStatus = 'upcoming';
  if (isRejected) {
    step1Status = 'rejected';
  } else if (isApproved || isFulfilled) {
    step1Status = 'completed';
  } else if (isPending || isDraft) {
    step1Status = 'current';
  }

  // Step 2: Proof of Purchase
  let step2Status: StepStatus = 'upcoming';
  if (!isRejected && !isDraft && !isPending) {
    if (isFulfilled || hasReceipt) {
      step2Status = 'completed';
    } else if (isApproved) {
      step2Status = 'current';
    }
  }

  // Step 3: Delivery
  let step3Status: StepStatus = 'upcoming';
  if (!isRejected && !isDraft && !isPending) {
    if (isFulfilled) {
      step3Status = 'completed';
    } else if (isApproved && hasReceipt) {
      step3Status = 'current';
    }
  }

  // Step 4: Fulfilled
  let step4Status: StepStatus = 'upcoming';
  if (isFulfilled) {
    step4Status = 'completed';
  }

  const steps: TrackerStep[] = [
    {
      id: 'approval',
      // Approved stays the review outcome once the request is fulfilled.
      label: isFulfilled ? formatPurchaseOrderStatus('approved') : formatPurchaseOrderStatus(order.status),
      status: step1Status,
      timestamp: isRejected ? order.reviewedAt : (order.reviewedAt || order.submittedAt || order.createdAt),
      detail: isRejected
        ? `Rejected: ${order.reviewNotes || 'Declined during review'}`
        : isApproved || isFulfilled
          ? `Approved by ${order.reviewedByName || 'Admin'}`
          : isPending
            ? 'Submitted · awaiting Owner / Admin review'
            : 'Draft · not yet submitted',
      icon: (status) => (
        <svg
          className="h-9 w-9 sm:h-11 sm:w-11"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Document outline */}
          <path d="M12 8C12 6.89543 12.8954 6 14 6H26L34 14V40C34 41.1046 33.1046 42 32 42H14C12.8954 42 12 41.1046 12 40V8Z" />
          <path d="M26 6V14H34" />
          {/* Checkmark in circle or X if rejected */}
          {status === 'rejected' ? (
            <path d="M18 22L26 30M26 22L18 30" strokeWidth="2.5" />
          ) : (
            <>
              <circle cx="21" cy="24" r="6" strokeWidth="1.5" />
              <path d="M18.5 24L20 25.5L23.5 22" strokeWidth="1.8" />
            </>
          )}
          {/* Pen signing on bottom right */}
          <path d="M28 32L36 38L32 40L28 32Z" strokeWidth="1.5" />
          <path d="M26 34L30 38" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      id: 'proof_of_purchase',
      label: 'Proof of Purchase',
      status: step2Status,
      timestamp: hasReceipt ? order.reviewedAt || order.createdAt : null,
      detail: hasReceipt
        ? (order.receiptId ? `Receipt linked (${order.receiptId.slice(0, 8)}…)` : 'Receipt attached')
        : step2Status === 'current'
          ? 'Upload / Link receipt evidence'
          : isFulfilled
            ? 'No receipt linked'
            : 'Available after approval',
      icon: () => (
        <svg
          className="h-9 w-9 sm:h-11 sm:w-11"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Receipt bill with serrated bottom */}
          <path d="M13 7C13 5.89543 13.8954 5 15 5H33C34.1046 5 35 5.89543 35 7V42L31.5 39.5L28 42L24.5 39.5L21 42L17.5 39.5L14 42L13 41V7Z" />
          {/* Dollar / Peso sign */}
          <path d="M24 11V23M21 13.5C21 12 22 11 24 11C26 11 27 12 27 13.5C27 15.5 21 16.5 21 18.5C21 20 22 21 24 21C26 21 27 20 27 18.5" strokeWidth="1.8" />
          {/* Horizontal lines */}
          <path d="M19 27H29" strokeWidth="2" />
          <path d="M19 32H26" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'delivery',
      label: 'Delivery',
      status: step3Status,
      timestamp: null,
      detail: step3Status === 'completed'
        ? 'Delivered to the shop'
        : step3Status === 'current'
          ? 'In transit'
          : 'Awaiting proof of purchase',
      icon: () => (
        <svg
          className="h-9 w-9 sm:h-11 sm:w-11"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Motion speed lines */}
          <path d="M6 20H13" strokeWidth="2" />
          <path d="M4 25H10" strokeWidth="2" />
          <path d="M7 30H12" strokeWidth="2" />
          {/* Delivery truck body */}
          <path d="M14 17H31V33H14V17Z" />
          {/* Truck cab */}
          <path d="M31 22H37L41 27V33H31V22Z" />
          {/* Wheels */}
          <circle cx="20" cy="35" r="3.5" strokeWidth="2" />
          <circle cx="36" cy="35" r="3.5" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'fulfilled',
      label: 'Fulfilled',
      status: step4Status,
      timestamp: order.fulfilledAt,
      detail: isFulfilled
        ? `Requested stocks received: ${formatDateTime(order.fulfilledAt)}`
        : 'Awaiting delivery',
      icon: () => (
        <svg
          className="h-9 w-9 sm:h-11 sm:w-11"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Truck outline */}
          <path d="M10 21H27V35H10V21Z" />
          <path d="M27 25H33L37 29V35H27V25Z" />
          <circle cx="16" cy="37" r="3" strokeWidth="2" />
          <circle cx="32" cy="37" r="3" strokeWidth="2" />
          {/* Box inside truck */}
          <path d="M14 26H23V32H14V26Z" strokeWidth="1.5" />
          <path d="M17 26V29H20V26" strokeWidth="1.5" />
          {/* Verified check badge at top right */}
          <circle cx="36" cy="15" r="7" strokeWidth="2" />
          <path d="M33 15L35.5 17.5L39 13" strokeWidth="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-white/10 bg-charcoal-light p-5 sm:p-8">
      <div className="relative mx-auto flex w-full max-w-4xl items-start justify-between">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          const isStepRejected = step.status === 'rejected';

          const colorClass = isStepRejected
            ? 'text-red-400'
            : isCompleted || isCurrent
              ? 'text-gold'
              : 'text-ivory-dim/40';

          const lineCompleted = idx < steps.length - 1 && (steps[idx + 1].status === 'completed' || steps[idx + 1].status === 'current');

          const isClickableReceiptStep = step.id === 'proof_of_purchase' && hasReceipt && Boolean(onViewReceipt);

          return (
            <React.Fragment key={step.id}>
              {/* Step item */}
              <div className="flex flex-1 flex-col items-center text-center z-10">
                {/* Icon wrapper */}
                <div
                  onClick={isClickableReceiptStep ? onViewReceipt : undefined}
                  role={isClickableReceiptStep ? 'button' : undefined}
                  tabIndex={isClickableReceiptStep ? 0 : undefined}
                  title={isClickableReceiptStep ? 'Click to view receipt modal' : undefined}
                  onKeyDown={
                    isClickableReceiptStep
                      ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onViewReceipt?.();
                        }
                      }
                      : undefined
                  }
                  className={`relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl transition-all duration-300 ${isClickableReceiptStep
                    ? 'cursor-pointer hover:scale-105 hover:border-gold hover:shadow-[0_0_20px_rgba(234,179,8,0.35)] '
                    : ''
                    }${isStepRejected
                      ? 'border border-red-400/40 bg-red-500/10 text-red-400'
                      : isCurrent
                        ? 'border border-gold/60 bg-gold/10 text-gold shadow-[0_0_25px_rgba(234,179,8,0.25)]'
                        : isCompleted
                          ? 'border border-gold/30 bg-gold/5 text-gold'
                          : 'border border-white/5 bg-charcoal-light/60 text-ivory-dim/35'
                    }`}
                >
                  {step.icon(step.status)}
                  {isCurrent && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-gold" />
                    </span>
                  )}
                </div>

                {/* Label */}
                <h4
                  className={`mt-3 sm:mt-4 text-xs sm:text-sm font-semibold tracking-wide transition-colors ${colorClass}`}
                >
                  {step.label}
                </h4>

                {/* Detail subtitle */}
                <p className="mt-1 hidden sm:block max-w-[140px] text-[11px] text-ivory-dim leading-snug">
                  {step.detail}
                </p>
                {step.timestamp && (
                  <p className="mt-0.5 hidden sm:block text-[10px] text-gold/80 font-mono">
                    {formatDateTime(step.timestamp)}
                  </p>
                )}
              </div>

              {/* Connecting dashed line */}
              {idx < steps.length - 1 && (
                <div className="relative top-8 sm:top-10 flex-1 px-1 sm:px-3">
                  <div
                    className={`w-full border-t-2 border-dashed transition-colors duration-300 ${lineCompleted ? 'border-gold/80' : 'border-white/20'
                      }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default OrderTracker;
