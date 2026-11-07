import React from 'react';
import { useBottleConsumption } from '../hooks/useBottleConsumption';
import { ConsumptionKPIs } from './ConsumptionKPIs';
import { ConsumptionFilters } from './ConsumptionFilters';
import { ConsumptionTable } from './ConsumptionTable';
import { PageHeader } from '../../../shared/components/PageHeader';

export const BottleConsumptionPanel: React.FC = () => {
  const {
    barbers,
    selectedBarberIds,
    setSelectedBarberIds,
    searchQuery,
    setSearchQuery,
    expandedGroup,
    toggleGroup,
    loading,
    groupedHistory,
    stats,
  } = useBottleConsumption();

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Bottle Lifecycle"
        title="Consumption History"
        description="Track handouts, empty bottle returns, and the completed customer count between each issue and return."
      />

      <ConsumptionKPIs stats={stats} />

      <ConsumptionFilters
        searchQuery={searchQuery}
        selectedBarberIds={selectedBarberIds}
        barbers={barbers}
        onSearchChange={setSearchQuery}
        onBarberChange={setSelectedBarberIds}
      />

      <ConsumptionTable
        groupedHistory={groupedHistory}
        expandedGroup={expandedGroup}
        loading={loading}
        searchQuery={searchQuery}
        selectedBarberId={selectedBarberIds.join(',')}
        onToggleGroup={toggleGroup}
      />
    </section>
  );
};

export default BottleConsumptionPanel;
