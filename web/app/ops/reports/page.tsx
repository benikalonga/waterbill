'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { Card, Failed, Loading, PageTitle, Select, Stat } from '@/components/ui';

export default function Reports() {
  const [days, setDays] = useState('30');
  const { data: d, error, reload } = useData((u) => ops(u), `/reports/water-balance?days=${days}`);
  if (error) return <Failed message={error} retry={reload} />;
  if (!d) return <Loading />;
  const fmt = (n: number) => `${n.toLocaleString()} m³`;
  const pct = (n: number) => (d.producedM3 ? Math.min(100, (n / d.producedM3) * 100) : 0);
  const BARS = [
    { label: 'Water produced', n: d.producedM3, cls: 'bg-tide-700' },
    { label: 'Metered consumption', n: d.consumedM3, cls: 'bg-tide-400' },
    { label: 'Non-revenue water', n: d.nonRevenueM3, cls: 'bg-coral' },
  ];
  return (
    <>
      <PageTitle title="Water balance" hint="How much of the water produced is actually reaching paying customers." actions={<Select className="w-auto" aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last year' }]} />} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Non-revenue water" value={`${d.nonRevenuePct}%`} tone={d.nonRevenuePct > 30 ? 'danger' : 'good'} />
        <Stat title="Produced" value={fmt(d.producedM3)} />
        <Stat title="Known leak losses" value={fmt(d.knownLeakLossM3)} hint="Estimated from open leaks" />
        <Stat title="Known illegal use" value={fmt(d.knownIllegalLossM3)} hint="Estimated from open cases" />
      </div>
      <Card className="mt-4 space-y-4 p-5">
        {BARS.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{b.label}</span><span>{fmt(b.n)}</span></div>
            <div className="h-3 rounded-full bg-mist"><div className={`h-3 rounded-full ${b.cls}`} style={{ width: `${pct(b.n)}%` }} /></div>
          </div>
        ))}
      </Card>
    </>
  );
}
