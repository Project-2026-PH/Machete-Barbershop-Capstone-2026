import React from 'react';
import { useSuppliers } from '../hooks/useSuppliers';
import { SupplierForm } from './SupplierForm';
import { DefaultSupplierAssignment } from './DefaultSupplierAssignment';
import { SupplierTable } from './SupplierTable';
import { PageHeader } from '../../../shared/components/PageHeader';

export const SupplierPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const {
    suppliers,
    catalog,
    editingId,
    form,
    setForm,
    defaultItemId,
    setDefaultItemId,
    defaultSupplierId,
    setDefaultSupplierId,
    loading,
    saving,
    reset,
    handleEdit,
    save,
    deactivate,
    assignDefault,
  } = useSuppliers();

  return (
    <section className="space-y-6">
      {!embedded && (
        <PageHeader
          eyebrow="Stock Requests"
          title="Supplier Directory"
          description="Maintain active suppliers and the default supplier used when a stock request line is created."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <SupplierForm
          editingId={editingId}
          form={form}
          saving={saving}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSave={() => void save()}
          onCancelEdit={reset}
        />

        <DefaultSupplierAssignment
          catalog={catalog}
          suppliers={suppliers}
          defaultItemId={defaultItemId}
          defaultSupplierId={defaultSupplierId}
          onItemChange={(itemId) => {
            setDefaultItemId(itemId);
            const item = catalog.find((candidate) => candidate.inventoryStockId === itemId);
            setDefaultSupplierId(item?.defaultSupplierId || '');
          }}
          onSupplierChange={setDefaultSupplierId}
          onAssign={() => void assignDefault()}
        />
      </div>

      <SupplierTable
        suppliers={suppliers}
        loading={loading}
        onEdit={handleEdit}
        onDeactivate={(supplier) => void deactivate(supplier)}
      />
    </section>
  );
};

export default SupplierPanel;
