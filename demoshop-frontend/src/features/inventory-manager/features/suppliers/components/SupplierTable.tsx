import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '../../../shared/components/EmptyState';
import type { InventoryManagerSupplier } from '../supplier.types';

interface SupplierTableProps {
  suppliers: InventoryManagerSupplier[];
  loading: boolean;
  onEdit: (supplier: InventoryManagerSupplier) => void;
  onDeactivate: (supplier: InventoryManagerSupplier) => void;
}

export const SupplierTable: React.FC<SupplierTableProps> = ({
  suppliers,
  loading,
  onEdit,
  onDeactivate,
}) => (
  <section className="overflow-hidden rounded-xl border border-white/10 bg-charcoal-light">
    <div className="border-b border-white/10 px-5 py-4">
      <h3 className="font-bold">Suppliers Table</h3>
    </div>
    {loading ? (
      <div className="space-y-3 p-4 sm:p-5" aria-label="Loading suppliers" role="status">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-white/10 bg-charcoal p-4 space-y-2 sm:space-y-0 sm:grid sm:gap-3 sm:grid-cols-5 sm:items-center"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    ) : suppliers.length === 0 ? (
      <div className="p-5">
        <EmptyState>No suppliers configured yet.</EmptyState>
      </div>
    ) : (
      <>
        {/* 1. Mobile Cards (< md) */}
        <div className="block md:hidden divide-y divide-white/5">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-ivory text-sm truncate">{supplier.name}</p>
                  <p className="text-xs text-ivory-dim mt-0.5">{supplier.address || 'No address'}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    supplier.isActive
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-ivory-dim'
                  }`}
                >
                  {supplier.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-charcoal p-2.5 rounded-sm border border-white/5">
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">Contact</span>
                  <span className="text-ivory mt-0.5 block truncate">
                    {supplier.contactPerson || supplier.email || supplier.contactNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">Default Items</span>
                  <span className="text-gold font-mono font-bold mt-0.5 block">
                    {supplier.itemsSupplied} supplied
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  className="flex-1 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded border border-white/15 px-3 text-xs text-ivory hover:border-gold hover:text-gold cursor-pointer transition-colors"
                  onClick={() => onEdit(supplier)}
                >
                  <Edit3 className="h-3.5 w-3.5 text-gold" />
                  Edit
                </button>
                {supplier.isActive && (
                  <button
                    type="button"
                    className="flex-1 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded border border-red-400/30 px-3 text-xs text-red-300 hover:bg-red-400/10 cursor-pointer transition-colors"
                    onClick={() => onDeactivate(supplier)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 2. Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 bg-charcoal text-[10px] font-semibold uppercase tracking-wider text-ivory-dim">
              <tr>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Default items</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="px-5 py-4">
                    <p className="font-bold">{supplier.name}</p>
                    <p className="mt-1 text-xs text-ivory-dim">{supplier.address || 'No address'}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-ivory-dim">
                    {supplier.contactPerson || supplier.email || supplier.contactNumber || '—'}
                  </td>
                  <td className="px-5 py-4 text-xs text-ivory-dim">{supplier.itemsSupplied}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${supplier.isActive
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 text-ivory-dim'
                        }`}
                    >
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-10 items-center gap-1 rounded border border-white/15 px-3 text-xs text-ivory hover:border-gold hover:text-gold"
                        onClick={() => onEdit(supplier)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {supplier.isActive && (
                        <button
                          className="inline-flex min-h-10 items-center gap-1 rounded border border-red-400/30 px-3 text-xs text-red-300 hover:bg-red-400/10"
                          onClick={() => onDeactivate(supplier)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </section>
);
