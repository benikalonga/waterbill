'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { dateTime, label } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Select, Table, TextArea } from '@/components/ui';

const EMPTY = { kind: 'PLANNED', zoneId: '', title: '', message: '', startsAt: '', endsAt: '' };

export default function Outages() {
  const { data, loading, reload } = useData((u) => ops(u), '/outages');
  const refs = useData((u) => ops(u), '/branches');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });
  const set = (id: string, status: string) => run(async () => { await ops(`/outages/${id}`, { method: 'PATCH', body: { status } }); reload(); }, 'Notice updated');

  return (
    <>
      <PageTitle title="Outage notices" hint="Customers in the area get an in-app notice and a text message." actions={<Button onClick={() => setForm(EMPTY)}>New notice</Button>} />
      <Table loading={loading} rows={data?.outages ?? []} empty="No notices." columns={[
        { key: 'title', title: 'Notice', render: (r: any) => <div><b>{r.title}</b><p className="text-xs text-slate2-3">{r.message}</p></div> },
        { key: 'kind', title: 'Type', render: (r: any) => label(r.kind) },
        { key: 'zone', title: 'Area', render: (r: any) => r.zone?.name ?? 'All areas' },
        { key: 'start', title: 'Starts', render: (r: any) => dateTime(r.startsAt) },
        { key: 'end', title: 'Ends', render: (r: any) => dateTime(r.endsAt) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'act', title: '', right: true, render: (r: any) => (['SCHEDULED', 'ACTIVE'].includes(r.status) ? <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => set(r.id, r.status === 'ACTIVE' ? 'RESOLVED' : 'CANCELLED')}>{r.status === 'ACTIVE' ? 'Resolve' : 'Cancel'}</Button> : null) },
      ]} />
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="New outage notice">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await ops('/outages', { body: { ...form, zoneId: form!.zoneId || null, endsAt: form!.endsAt || null } }); setForm(null); reload(); return r; }, 'Notice sent to customers'); }}>
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel text="Type"><Select {...f('kind')} options={['PLANNED', 'EMERGENCY', 'WATER_QUALITY']} /></FieldLabel>
            <FieldLabel text="Area"><Select {...f('zoneId')} options={[{ value: '', label: 'All areas' }, ...(refs.data?.zones ?? []).map((z: any) => ({ value: z.id, label: z.name }))]} /></FieldLabel>
          </div>
          <FieldLabel text="Title"><Input required minLength={3} maxLength={160} {...f('title')} /></FieldLabel>
          <FieldLabel text="Message to customers"><TextArea required minLength={3} maxLength={1000} {...f('message')} /></FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel text="Starts"><Input required type="datetime-local" {...f('startsAt')} /></FieldLabel>
            <FieldLabel text="Ends (optional)"><Input type="datetime-local" {...f('endsAt')} /></FieldLabel>
          </div>
          <Button busy={busy} className="w-full">Publish and notify</Button>
        </form>
      </Modal>
    </>
  );
}
