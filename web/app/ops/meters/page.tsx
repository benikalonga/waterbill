'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { ago, dateTime, label, m3 } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, SearchBox, Select, Table, Tabs } from '@/components/ui';

const EMPTY = { accountNumber: '', serial: '', kind: 'MECHANICAL', link: 'MANUAL', brand: '', model: '', diameterMm: '15', installedAt: new Date().toISOString().slice(0, 10), initialLitres: '0' };

export default function Meters() {
  const [tab, setTab] = useState('meters');
  const list = usePaged('/meters', { q: '', status: '' });
  const pending = usePaged('/readings/pending');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });
  const review = (id: string, accept: boolean) => run(async () => { await ops(`/readings/${id}/review`, { body: { accept } }); pending.reload(); list.reload(); }, accept ? 'Reading accepted' : 'Reading rejected');
  const setStatus = (id: string, status: string) => run(async () => { await ops(`/meters/${id}`, { method: 'PATCH', body: { status } }); list.reload(); }, 'Meter updated');

  return (
    <>
      <PageTitle title="Meters" actions={<Button onClick={() => setForm(EMPTY)}>Add meter</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'meters', label: 'All meters' }, { value: 'pending', label: `Readings to check (${pending.data?.total ?? 0})` }]} />
      {tab === 'meters' ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchBox value={list.filters.q} onChange={(v) => list.setFilter('q', v)} placeholder="Serial or customer" />
            <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['ACTIVE', 'FAULTY', 'MAINTENANCE', 'TAMPERED', 'REPLACED', 'INACTIVE'].map((s) => ({ value: s, label: label(s) }))]} />
          </div>
          <Table loading={list.loading} rows={list.items} columns={[
            { key: 'serial', title: 'Serial', render: (r: any) => <b>{r.serial}</b> },
            { key: 'customer', title: 'Customer', render: (r: any) => (r.customer ? `${r.customer.firstName} ${r.customer.lastName}` : 'Unassigned') },
            { key: 'kind', title: 'Type', render: (r: any) => `${label(r.kind)} · ${label(r.link)}` },
            { key: 'index', title: 'Index', render: (r: any) => m3(r.lastLitres) },
            { key: 'seen', title: 'Last contact', render: (r: any) => (r.kind === 'SMART' ? `${ago(r.lastSeenAt)}${r.batteryPct != null ? ` · ${r.batteryPct}%` : ''}` : '—') },
            { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
            { key: 'set', title: '', render: (r: any) => <Select aria-label="Change status" className="w-32 py-1 text-xs" value={r.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setStatus(r.id, e.target.value)} options={['ACTIVE', 'FAULTY', 'MAINTENANCE', 'TAMPERED', 'REPLACED', 'INACTIVE']} /> },
          ]} />
          {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
        </>
      ) : (
        <Table loading={pending.loading} rows={pending.items} empty="No readings are waiting." columns={[
          { key: 'customer', title: 'Customer', render: (r: any) => <div><b>{r.meter.customer?.firstName} {r.meter.customer?.lastName}</b><p className="text-xs text-slate2-3">{r.meter.serial}</p></div> },
          { key: 'when', title: 'Submitted', render: (r: any) => dateTime(r.createdAt) },
          { key: 'source', title: 'Source', render: (r: any) => label(r.source) },
          { key: 'prev', title: 'Last index', render: (r: any) => m3(r.meter.lastLitres) },
          { key: 'new', title: 'New index', render: (r: any) => <b>{m3(r.totalLitres)}</b> },
          { key: 'flag', title: 'Note', render: (r: any) => (r.flagged ? <Badge tone="red">{r.flagReason}</Badge> : r.photoUrl ? <a className="text-tide-600 underline" href={r.photoUrl} target="_blank" rel="noreferrer">Photo</a> : '—') },
          { key: 'act', title: '', right: true, render: (r: any) => <div className="flex justify-end gap-1.5"><Button className="px-2.5 py-1 text-xs" busy={busy} onClick={() => review(r.id, true)}>Accept</Button><Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => review(r.id, false)}>Reject</Button></div> },
        ]} />
      )}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add meter">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/meters', { body: { ...form, accountNumber: form!.accountNumber || undefined, diameterMm: Number(form!.diameterMm), initialLitres: Math.round(Number(form!.initialLitres) * 1000) } }); setForm(null); list.reload(); }, 'Meter added'); }}>
          <FieldLabel text="Serial number"><Input required {...f('serial')} /></FieldLabel>
          <FieldLabel text="Customer account (optional)"><Input className="uppercase" placeholder="WB-XXXXXXXX" {...f('accountNumber')} /></FieldLabel>
          <FieldLabel text="Type"><Select {...f('kind')} options={['MECHANICAL', 'ELECTRONIC', 'SMART']} /></FieldLabel>
          <FieldLabel text="Connection"><Select {...f('link')} options={['MANUAL', 'LORAWAN', 'GSM', 'NBIOT', 'ZIGBEE']} /></FieldLabel>
          <FieldLabel text="Brand"><Input required {...f('brand')} /></FieldLabel>
          <FieldLabel text="Model"><Input required {...f('model')} /></FieldLabel>
          <FieldLabel text="Diameter (mm)"><Input required type="number" {...f('diameterMm')} /></FieldLabel>
          <FieldLabel text="Starting index (m³)"><Input required type="number" step="0.001" {...f('initialLitres')} /></FieldLabel>
          <div className="col-span-2"><FieldLabel text="Installed on"><Input required type="date" {...f('installedAt')} /></FieldLabel></div>
          <Button busy={busy} className="col-span-2">Save</Button>
        </form>
      </Modal>
    </>
  );
}
