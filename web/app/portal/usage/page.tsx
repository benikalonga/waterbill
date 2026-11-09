'use client';
import { useState } from 'react';
import { portal } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { dateTime, label, m3, shortPeriod } from '@/lib/format';
import { Badge, Bars, Button, Card, Failed, FieldLabel, Input, Loading, PageTitle, Stat, Table } from '@/components/ui';

export default function Usage() {
  const { data, error, reload } = useData((u) => portal(u), '/usage');
  const [index, setIndex] = useState('');
  const [limit, setLimit] = useState<string | null>(null);
  const { busy, run } = useAction();
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;

  const { meter, monthly, readings, monthlyLimitLitres, networkAverageLitres } = data;
  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  const change = last && prev?.litres ? Math.round(((last.litres - prev.litres) / prev.litres) * 100) : null;
  const limitValue = limit ?? (monthlyLimitLitres ? String(monthlyLimitLitres / 1000) : '');

  return (
    <div className="space-y-4">
      <PageTitle title="My water use" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat title="Last bill" value={m3(last?.litres)} hint={change != null ? `${change > 0 ? '+' : ''}${change}% from the month before` : undefined} />
        <Stat title="Network average" value={m3(networkAverageLitres)} hint="Per account, per month" />
        <Stat title="Meter index" value={m3(meter?.lastLitres)} hint={meter ? `${meter.serial} · ${label(meter.status)}` : 'No meter linked'} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-bold">Last 12 bills</h2>
        <Bars format={m3} height={170} data={monthly.map((x: any) => ({ label: shortPeriod(x.period), value: x.litres, muted: x.basis !== 'ACTUAL' }))} />
        <p className="mt-2 text-xs text-slate2-3">Paler bars are estimated months.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4" >
          <h2 id="reading" className="font-bold">Send a meter reading</h2>
          <p className="mb-3 text-sm text-slate2-3">Avoid estimated bills by sending us your index. We check it before it counts.</p>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await portal('/readings', { body: { totalLitres: Math.round(Number(index) * 1000) } }); setIndex(''); reload(); }, 'Reading sent. Thank you!'); }}>
            <div className="flex-1"><FieldLabel text="Index in m³"><Input required type="number" min="0" step="0.001" value={index} onChange={(e) => setIndex(e.target.value)} disabled={!meter} /></FieldLabel></div>
            <Button busy={busy} disabled={!meter}>Send</Button>
          </form>
        </Card>
        <Card className="p-4">
          <h2 className="font-bold">Monthly limit</h2>
          <p className="mb-3 text-sm text-slate2-3">We alert you once when you pass this in a month.</p>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await portal('/profile', { method: 'PATCH', body: { monthlyLimitLitres: limitValue ? Math.round(Number(limitValue) * 1000) : null } }); reload(); }, 'Limit saved'); }}>
            <div className="flex-1"><FieldLabel text="Limit in m³ (empty for none)"><Input type="number" min="1" value={limitValue} onChange={(e) => setLimit(e.target.value)} /></FieldLabel></div>
            <Button variant="ghost" busy={busy}>Save</Button>
          </form>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 font-bold">Readings</h2>
        <Table rows={readings.slice(0, 15)} empty="No readings yet." columns={[
          { key: 'readAt', title: 'Date', render: (r: any) => dateTime(r.readAt) },
          { key: 'total', title: 'Index', render: (r: any) => m3(r.totalLitres) },
          { key: 'usage', title: 'Used', render: (r: any) => m3(r.usageLitres) },
          { key: 'source', title: 'Source', render: (r: any) => label(r.source) },
          { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        ]} />
      </div>
    </div>
  );
}
