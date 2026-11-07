import React from 'react';
import { Search } from 'lucide-react';
import { MultiSelect } from '../../../shared/components/MultiSelect';
import type { InventoryManagerBarber } from '../../bottle-lifecycle/lifecycle.types';

interface ConsumptionFiltersProps {
  searchQuery: string;
  selectedBarberIds: string[];
  barbers: InventoryManagerBarber[];
  onSearchChange: (query: string) => void;
  onBarberChange: (barberIds: string[]) => void;
}

export const ConsumptionFilters: React.FC<ConsumptionFiltersProps> = ({
  searchQuery,
  selectedBarberIds,
  barbers,
  onSearchChange,
  onBarberChange,
}) => (
  <div className="flex flex-col sm:flex-row gap-3">
    <div className="flex-1 space-y-1.5">
      <span className="block text-xs text-ivory-dim">Search</span>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim/60" />
        <input
          type="text"
          placeholder="Search by bottle name or barber..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-11 w-full rounded border border-white/10 bg-charcoal pl-9 pr-3 py-2 text-sm text-ivory outline-none focus:border-gold/60 placeholder:text-ivory-dim/40"
        />
      </div>
    </div>
    <div className="w-full sm:w-72">
      <MultiSelect
        label="Filter by barber"
        values={selectedBarberIds}
        onChange={onBarberChange}
        placeholder="All barbers"
        searchPlaceholder="Search barbers…"
        emptyMessage="No barbers found"
        options={barbers.map((barber) => ({ value: String(barber.id), label: barber.name }))}
      />
    </div>
  </div>
);
