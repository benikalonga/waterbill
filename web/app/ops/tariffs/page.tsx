'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { label, money } from '@/lib/format';
import { useStaff } from '@/components/OpsShell';
import { Button, Card, Failed, FieldLabel, Input, Loading, PageTitle } from '@/components/ui';

function Rule({ rule, canEdit, onSaved }: { rule: any; canEdit: boolean; onSaved: () => void }) {
  const [fixed, setFixed] = useState(String(rule.fixedChargeCents / 100));
  const [vat, setVat] = useState(String(rule.vatBps / 100));
  const [bands, setBands] = useState<{ fromM3: string; toM3: string; rate: string }[]>([]);
  const { busy, run } = useAction();
  useEffect(() => setBands(rule.bands.map((b: any) => ({ fromM3: String(b.fromM3), toM3: b.toM3 == null ? '' : String(b.toM3), rate: String(b.centsPerM3 / 100) }))), [rule]);
  const edit = (i: number, k: 'fromM3' | 'toM3' | 'rate', v: string) => setBands(bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  const save = () => run(async () => {
    await ops(`/tariffs/${rule.tariffClass}`, {
      method: 'PUT',
      body: {
        fixedChargeCents: Math.round(Number(fixed) * 100), vatBps: Math.round(Number(vat) * 100),
        bands: bands.map((b) => ({ fromM3: Number(b.fromM3), toM3: b.toM3 === '' ? null : Number(b.toM3), centsPerM3: Math.round(Number(b.rate) * 100) })),
      },
    });
    onSaved();
  }, `${label(rule.tariffClass)} tariff saved`);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">{label(rule.tariffClass)}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <FieldLabel text="Fixed charge"><Input disabled={!canEdit} type="number" step="0.01" value={fixed} onChange={(e) => setFixed(e.target.value)} /></FieldLabel>
        <FieldLabel text="VAT %"><Input disabled={!canEdit} type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} /></FieldLabel>
      </div>
      <p className="mb-1 mt-4 text-xs font-semibold text-slate2-2">Bands (m³ from, to, price per m³). Leave the last "to" empty.</p>
      <div className="space-y-2">
        {bands.map((b, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label="From" disabled={!canEdit} type="number" value={b.fromM3} onChange={(e) => edit(i, 'fromM3', e.target.value)} />
            <Input aria-label="To" disabled={!canEdit} type="number" placeholder="∞" value={b.toM3} onChange={(e) => edit(i, 'toM3', e.target.value)} />
            <Input aria-label="Price" disabled={!canEdit} type="number" step="0.01" value={b.rate} onChange={(e) => edit(i, 'rate', e.target.value)} />
            {canEdit && <button aria-label="Remove band" className="px-1 text-slate2-4 hover:text-red-600" onClick={() => setBands(bands.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex justify-between">
          <Button variant="ghost" onClick={() => setBands([...bands, { fromM3: bands[bands.length - 1]?.toM3 || '0', toM3: '', rate: '0' }])}><Plus size={14} /> Band</Button>
          <Button busy={busy} onClick={save}>Save</Button>
        </div>
      )}
      <p className="mt-3 text-xs text-slate2-3">Currently {money(rule.fixedChargeCents)} fixed, plus usage bands.</p>
    </Card>
  );
}

export default function Tariffs() {
  const staff = useStaff();
  const { data, error, reload } = useData((u) => ops(u), '/tariffs');
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  // Classes with no rule yet still appear, so a new installation can set them up.
  const rules = ['LIFELINE', 'STANDARD', 'COMMERCIAL', 'INDUSTRIAL'].map((tariffClass) =>
    data.tariffs.find((r: any) => r.tariffClass === tariffClass) ?? { tariffClass, fixedChargeCents: 0, vatBps: 1600, bands: [{ fromM3: 0, toM3: null, centsPerM3: 0 }] });
  return (
    <>
      <PageTitle title="Tariffs" hint="New prices apply from the next billing run. Bills already issued do not change." />
      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((r: any) => <Rule key={r.tariffClass} rule={r} canEdit={['ADMIN', 'COMMERCIAL_MANAGER'].includes(staff.role)} onSaved={reload} />)}
      </div>
    </>
  );
}
