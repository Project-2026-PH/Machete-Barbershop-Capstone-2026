import React from 'react';
import type { ConsumptionStats } from '../consumption.types';

interface ConsumptionKPIsProps {
  stats: ConsumptionStats;
}

export const ConsumptionKPIs: React.FC<ConsumptionKPIsProps> = ({ stats }) => (
  <div className="grid grid-cols-3 gap-3 sm:gap-4">
    <div className="min-w-0 rounded-xl border border-white/10 bg-charcoal-light p-3 sm:p-4">
      <p className="text-[10px] uppercase leading-snug tracking-wider text-ivory-dim sm:text-xs">Total Returned Bottles</p>
      <p className="mt-2 text-2xl font-bold text-ivory">{stats.totalReturns}</p>
    </div>
    <div className="min-w-0 rounded-xl border border-white/10 bg-charcoal-light p-3 sm:p-4">
      <p className="text-[10px] uppercase leading-snug tracking-wider text-ivory-dim sm:text-xs">Customers Served</p>
      <p className="mt-2 text-2xl font-bold text-gold">{stats.totalCustomers}</p>
    </div>
    <div className="min-w-0 rounded-xl border border-white/10 bg-charcoal-light p-3 sm:p-4">
      <p className="text-[10px] uppercase leading-snug tracking-wider text-ivory-dim sm:text-xs">Active Barbers Logged</p>
      <p className="mt-2 text-2xl font-bold text-ivory">{stats.uniqueBarbers}</p>
    </div>
  </div>
);
