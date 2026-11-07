import React, { useState } from 'react';
import { CreditCard, Plus, Trash2, Download, Receipt, AlertCircle, Lock, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { Modal } from '@/components/feedback/Modal';

interface PaymentsTabProps {
  transactionsData: any[];
  setActiveTab: (tab: string) => void;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({ transactionsData, setActiveTab }) => {
  const { addToast } = useToast();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddCard = () => {
    setIsAddModalOpen(true);
  };

  const handleSaveCard = (e: any) => {
    e.preventDefault();
    setIsProcessing(true);

    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      setIsAddModalOpen(false);
      addToast({
        type: 'success',
        title: 'Payment Method Added',
        message: 'Your new card has been successfully linked.',
      });
    }, 1500);
  };

  const confirmDelete = (cardName: string) => {
    setCardToDelete(cardName);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = () => {
    setIsDeleteModalOpen(false);
    setTimeout(() => {
      addToast({
        type: 'success',
        title: 'Payment Method Removed',
        message: `Successfully removed ${cardToDelete}.`,
      });
      setCardToDelete(null);
    }, 500);
  };

  return (
    <div className="space-y-12 animate-fade-in w-full pb-8">
      <div className="">
        <button
          onClick={() => setActiveTab('settings')}
          className="flex items-center gap-2 text-ivory-dim hover:text-gold transition-colors group mb-6"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium uppercase tracking-wider">Back to Settings</span>
        </button>
      </div>
      {/* Payment Methods */}
      <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 p-8 rounded-sm shadow-lg">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-serif font-bold text-ivory">Payment Methods</h3>
          <Button
            variant="outline"
            onClick={handleAddCard}
            className="text-xs py-2 px-4 flex items-center gap-2 border-white/10 hover:border-gold hover:text-gold"
          >
            <Plus className="w-4 h-4" /> Add New
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1 */}
          <div className="bg-gradient-to-br from-charcoal to-black border border-white/10 p-8 rounded-xl relative overflow-hidden group hover:border-gold/50 transition-all duration-500 shadow-2xl">
            <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-gold/10 transition-colors duration-500"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <CreditCard className="w-10 h-10 text-gold" />
                <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest text-ivory backdrop-blur-md border border-white/5">Default</span>
              </div>
              <div className="mb-6">
                <span className="text-ivory-dim text-[10px] uppercase tracking-[0.2em] block mb-2">Card Number</span>
                <span className="text-2xl font-mono text-ivory tracking-widest group-hover:text-gold transition-colors">•••• •••• •••• 4242</span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-ivory-dim text-[10px] uppercase tracking-[0.2em] block mb-1">Expires</span>
                  <span className="text-sm text-ivory font-mono">12/25</span>
                </div>
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png" alt="Mastercard" className="h-8 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <button
              onClick={() => confirmDelete('Visa ending in 4242')}
              className="absolute top-4 right-4 z-20 text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-full"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          {/* GCash */}
          <div className="bg-[#007DFE]/5 border border-[#007DFE]/20 p-8 rounded-xl relative overflow-hidden group hover:border-[#007DFE]/50 transition-all duration-500">
            <div className="absolute top-0 right-0 p-32 bg-[#007DFE]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <span className="font-bold text-[#007DFE] text-2xl tracking-tight">GCash</span>
                <div className="w-3 h-3 rounded-full bg-[#007DFE] shadow-[0_0_10px_#007DFE]"></div>
              </div>
              <div className="mb-6">
                <span className="text-ivory-dim text-[10px] uppercase tracking-[0.2em] block mb-2">Account Number</span>
                <span className="text-2xl font-mono text-ivory tracking-widest">0917 ••• 4567</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#007DFE] bg-[#007DFE]/10 px-3 py-1 rounded-full border border-[#007DFE]/20">Linked</span>
              </div>
            </div>

            <button
              onClick={() => confirmDelete('GCash Account')}
              className="absolute top-4 right-4 z-20 text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-full"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 rounded-sm overflow-hidden shadow-lg">
        <div className="p-8 border-b border-white/5 flex items-center gap-3">
          <Receipt className="w-5 h-5 text-gold" />
          <h3 className="font-serif font-bold text-ivory text-xl">Billing History</h3>
        </div>

        {Array.isArray(transactionsData) && transactionsData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-ivory-dim uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="px-8 py-5 font-medium">Date</th>
                  <th className="px-8 py-5 font-medium">Description</th>
                  <th className="px-8 py-5 font-medium">Amount</th>
                  <th className="px-8 py-5 font-medium">Method</th>
                  <th className="px-8 py-5 font-medium text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactionsData.map((item) => (
                  <tr key={item.transaction_id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-8 py-6 text-ivory font-light">{new Date(item.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    <td className="px-8 py-6 text-ivory font-medium">{item.description || `Service Payment - Ref #${item.transaction_id}`}</td>
                    <td className="px-8 py-6 text-gold font-bold font-mono text-lg">₱{item.total_amount}</td>
                    <td className="px-8 py-6 text-ivory-dim text-xs uppercase tracking-wider">{item.payment_method}</td>
                    <td className="px-8 py-6 text-right">
                      <button className="text-ivory-dim hover:text-gold transition-colors p-2 hover:bg-white/5 rounded-full">
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center justify-center text-ivory-dim">
            <div className="p-4 bg-white/5 rounded-full mb-4">
              <Receipt className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-lg font-light">No billing history available.</p>
            <p className="text-xs mt-2 opacity-50">Your recent transactions will appear here.</p>
          </div>
        )}
      </div>

      {/* Add Card Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Payment Method"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveCard} disabled={isProcessing}>
              {isProcessing ? 'Saving...' : 'Save Card'}
            </Button>
          </>
        }
      >
        <form className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Card Number</label>
            <div className="relative">
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim" />
              <input
                type="text"
                placeholder="0000 0000 0000 0000"
                className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 pl-12 text-ivory focus:border-gold focus:outline-none transition-colors font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Expiry Date</label>
              <input
                type="text"
                placeholder="MM/YY"
                className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">CVC</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim" />
                <input
                  type="text"
                  placeholder="123"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 pl-12 text-ivory focus:border-gold focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Cardholder Name</label>
            <input
              type="text"
              placeholder="JOHN DOE"
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors uppercase"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Remove Payment Method"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleDelete} className="bg-red-500 border-red-500 hover:bg-red-600 text-white">Remove</Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <div className="p-2 bg-red-500/10 rounded-full shrink-0">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-ivory mb-2">Are you sure you want to remove <span className="font-bold text-white">{cardToDelete}</span>?</p>
            <p className="text-sm text-ivory-dim">This action cannot be undone. You will need to re-enter your details to use this payment method again.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
