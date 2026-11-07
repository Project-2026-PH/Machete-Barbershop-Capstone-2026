import React from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '../../../shared/components/Field';

interface SupplierFormProps {
  editingId: string | null;
  form: {
    name: string;
    contactPerson: string;
    contactNumber: string;
    email: string;
    address: string;
    notes: string;
  };
  saving: boolean;
  onChange: (patch: Partial<SupplierFormProps['form']>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
}

export const SupplierForm: React.FC<SupplierFormProps> = ({
  editingId,
  form,
  saving,
  onChange,
  onSave,
  onCancelEdit,
}) => (
  <section className="rounded-xl border border-white/10 bg-charcoal-light p-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold">{editingId ? 'Edit supplier' : 'Add supplier'}</h3>
      {editingId && (
        <button className="text-xs text-gold hover:underline" onClick={onCancelEdit}>
          Cancel edit
        </button>
      )}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field
        label="Supplier name"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="e.g. SampleBranch Supplies"
      />
      <Field
        label="Contact person"
        value={form.contactPerson}
        onChange={(e) => onChange({ contactPerson: e.target.value })}
      />
      <Field
        label="Contact number"
        value={form.contactNumber}
        onChange={(e) => onChange({ contactNumber: e.target.value })}
      />
      <Field
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => onChange({ email: e.target.value })}
      />
      <Field
        label="Address"
        value={form.address}
        onChange={(e) => onChange({ address: e.target.value })}
      />
      <Field
        label="Notes"
        value={form.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
      />
    </div>
    <div className="mt-4 flex justify-end">
      <Button onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add supplier'}
      </Button>
    </div>
  </section>
);
