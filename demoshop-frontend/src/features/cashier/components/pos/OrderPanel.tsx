import React from 'react';

interface ActiveOrder {
    lineItems: any[];
    customerName?: string;
    status?: string;
    assignedBarber?: {
        name?: string;
    } | null;
}

interface OrderPanelProps {
    activeOrder: ActiveOrder;
    onRemoveItem?: (index: number) => void;
    onAddToQueue?: () => void;
    isSubmitting?: boolean;
    isRetailOnly?: boolean;
    isEditMode?: boolean;
    hasChanges?: boolean;
    onCancel?: () => void;
    onUpdateQueue?: () => void;
    originalItemKeys?: string[];
    onBarberClick?: () => void;
}

const OrderPanel: React.FC<OrderPanelProps> = ({
    activeOrder,
    onRemoveItem,
    onAddToQueue,
    isSubmitting = false,
    isRetailOnly = false,
    isEditMode = false,
    hasChanges = false,
    onCancel,
    onUpdateQueue,
    originalItemKeys,
    onBarberClick,
}) => {
    const canCheckout = activeOrder.status !== 'CLOSED' && activeOrder.lineItems.length > 0;
    const subtotal = activeOrder.lineItems.reduce((sum, item) => (
        sum + Number(item.price || 0) * Number(item.quantity || 1)
    ), 0);
    const checkoutLabel = isRetailOnly ? 'Complete Retail Sale' : 'Add to queue';
    const submittingLabel = isRetailOnly ? 'Completing sale…' : 'Adding to queue…';
    const closedLabel = isRetailOnly ? 'Retail sale complete' : 'Added to queue';

    return (
        <div className="flex min-h-0 flex-col lg:h-full bg-white/[0.02]">
            <div className="border-b border-white/5 bg-white/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold">
                    Cashier • {isEditMode ? 'Edit Queue Entry' : isRetailOnly ? 'Retail' : 'Walk-in'}
                </p>
                <h3 className="mt-0.5 text-base font-serif font-bold text-ivory">Service Summary</h3>
            </div>

            <div className="border-b border-white/5 bg-charcoal/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-ivory-dim">Customer</span>
                    <span className="text-right font-semibold text-ivory">
                        {activeOrder.customerName || (isRetailOnly ? 'Retail customer' : 'Not entered')}
                    </span>
                </div>
                {!isRetailOnly && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-ivory-dim">Barber</span>
                        <button
                            type="button"
                            onClick={onBarberClick}
                            disabled={!onBarberClick}
                            className={`text-right font-semibold text-gold ${onBarberClick ? 'cursor-pointer hover:text-gold-dim hover:underline' : ''} disabled:cursor-default`}
                            aria-label={onBarberClick ? 'Change assigned barber' : undefined}
                        >
                            {activeOrder.assignedBarber?.name || (activeOrder.status === 'OPEN' || activeOrder.lineItems.length > 0 ? 'Auto-assign (SECT)' : 'Not assigned')}
                        </button>
                    </div>
                )}
            </div>

            <div className="min-h-0 p-3.5 lg:flex-1 lg:overflow-y-auto custom-scrollbar">
                {activeOrder.lineItems.length === 0 ? (
                    <div className="flex min-h-20 items-center justify-center text-center text-xs text-ivory-dim border border-dashed border-white/10 rounded-sm p-4">
                        Selected services and retail items will appear here.
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ivory-dim">
                            Selected items ({activeOrder.lineItems.length})
                        </p>
                        {activeOrder.lineItems.map((item, index) => {
                            const itemKey = `${item.kind}:${item.id}`;
                            const isNewlyAdded = isEditMode && originalItemKeys && !originalItemKeys.includes(itemKey);

                            return (
                                <div
                                    key={item._uid || index}
                                    className={`rounded-sm border p-2.5 transition-colors ${
                                        isNewlyAdded
                                            ? 'border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/50'
                                            : 'border-white/5 bg-charcoal/70 hover:border-white/10'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-xs font-semibold truncate ${isNewlyAdded ? 'text-emerald-300' : 'text-ivory'}`}>
                                                    {item.name}
                                                </span>
                                                {isNewlyAdded && (
                                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                                        + Added
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-ivory-dim">
                                                {item.kind === 'product' ? `Retail${item.quantity > 1 ? ` · qty ${item.quantity}` : ''}` : item.type}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <div className={`text-xs font-bold ${isNewlyAdded ? 'text-emerald-400' : 'text-gold'}`}>
                                                ₱{(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                                            </div>
                                            {onRemoveItem && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveItem(index)}
                                                    className="p-1 text-ivory-dim/50 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors cursor-pointer text-xs"
                                                    aria-label={`Remove ${item.name}`}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="border-t border-white/5 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-ivory-dim font-medium">Total</span>
                    <span className="text-xl font-serif font-bold text-gold">₱{subtotal.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-[11px] text-ivory-dim">
                    {isEditMode
                        ? 'Changes will update the customer\'s active queue service.'
                        : isRetailOnly
                        ? 'Retail-only sales are completed now and do not join a barber queue.'
                        : 'Payment is handled after service completion.'}
                </p>

                {isEditMode ? (
                    hasChanges ? (
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={isSubmitting}
                                className="w-1/2 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider bg-white/10 text-ivory hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={onUpdateQueue || onAddToQueue}
                                disabled={isSubmitting || activeOrder.lineItems.filter(i => i.kind === 'service').length === 0}
                                className="w-1/2 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider bg-gold text-charcoal hover:bg-gold-dim transition-colors disabled:bg-white/10 disabled:text-ivory-dim/40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                            >
                                {isSubmitting ? 'Updating…' : 'Update Queue'}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="mt-3 w-full py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider bg-white/10 text-ivory hover:bg-white/15 transition-colors cursor-pointer"
                        >
                            Close
                        </button>
                    )
                ) : (
                    <button
                        type="button"
                        onClick={onAddToQueue}
                        disabled={!canCheckout || isSubmitting}
                        className="mt-3 w-full py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider bg-gold text-charcoal hover:bg-gold-dim transition-colors disabled:bg-white/10 disabled:text-ivory-dim/40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                    >
                        {isSubmitting ? submittingLabel : activeOrder.status === 'CLOSED' ? closedLabel : checkoutLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export default OrderPanel;
