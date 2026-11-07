import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getInvoiceProfile, updateInvoiceProfile, type InvoiceProfileForm } from '@/services/invoiceProfile.service';

const emptyProfile: InvoiceProfileForm = {
  tradeName: '', registeredName: '', registeredAddress: '', taxType: 'NON_VAT',
  tin: '', branchCode: '', confirmedFromForm2303: false,
};

export const InvoiceProfileSection: React.FC = () => {
  const [profile, setProfile] = useState<InvoiceProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getInvoiceProfile().then((data) => {
      if (data) setProfile({
        tradeName: data.tradeName,
        registeredName: data.registeredName,
        registeredAddress: data.registeredAddress,
        taxType: data.taxType,
        tin: data.tin,
        branchCode: data.branchCode,
        confirmedFromForm2303: data.confirmedFromForm2303,
      });
    }).catch((err: any) => setError(err?.response?.data?.message || err?.message || 'Unable to load invoice profile.'))
      .finally(() => setLoading(false));
  }, []);

  const change = <K extends keyof InvoiceProfileForm>(key: K, value: InvoiceProfileForm[K]) => {
    setSaved(false);
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateInvoiceProfile(profile);
      setProfile({ ...profile, tin: result.tin, branchCode: result.branchCode });
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to save invoice profile.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof InvoiceProfileForm, type = 'text') => (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ivory-dim">{label}</span>
      <input type={type} value={String(profile[key])} onChange={(event) => change(key, event.target.value as never)}
        className="w-full rounded-sm border border-white/15 bg-charcoal px-3 py-2.5 text-sm text-ivory focus:border-gold focus:outline-none" />
    </label>
  );

  if (loading) return <div className="py-8 text-sm text-ivory-dim">Loading protected invoice profile…</div>;

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="border-b border-white/10 pb-4">
        <h3 className="flex items-center gap-2 text-xl font-serif font-bold text-ivory"><ShieldCheck className="h-5 w-5 text-gold" /> Business Invoice Profile</h3>
        <p className="mt-2 text-xs leading-relaxed text-ivory-dim">These details are stored server-side and excluded from public shop settings. Copy them from the current BIR Form 2303. Full TIN values are only shown in this authenticated admin form and authorized invoices.</p>
      </div>
      {error && <div className="flex gap-2 rounded border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('Trade name', 'tradeName')}
        {field('Registered taxpayer name', 'registeredName')}
        {field('Registered business address', 'registeredAddress')}
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-ivory-dim">Tax type</span>
          <select value={profile.taxType} onChange={(event) => change('taxType', event.target.value as InvoiceProfileForm['taxType'])} className="w-full rounded-sm border border-white/15 bg-charcoal px-3 py-2.5 text-sm text-ivory"><option value="NON_VAT">Non-VAT</option><option value="VAT">VAT</option></select>
        </label>
        {field('TIN (9 digits)', 'tin', 'password')}
        {field('Branch code (5 digits)', 'branchCode', 'password')}
      </div>
  
      <div className="flex items-center gap-3 border-t border-white/10 pt-4">
        <Button type="submit" variant="primary" disabled={saving} className="flex items-center gap-2"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Invoice Profile'}</Button>
        {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" />Saved</span>}
      </div>
    </form>
  );
};
