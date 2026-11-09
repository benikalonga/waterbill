'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { dateTime, label } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, Select, Table, TextArea } from '@/components/ui';

const KINDS = ['LEAK_REPAIR', 'METER_REPLACEMENT', 'METER_READING', 'FRAUD_CHECK', 'PREVENTIVE_MAINTENANCE', 'NEW_CONNECTION', 'DISCONNECTION', 'RECONNECTION'];
const EMPTY = { kind: 'PREVENTIVE_MAINTENANCE', priority: 'NORMAL', address: '', description: '', assigneeId: '', scheduledFor: '' };

export default function Work() {
  const list = usePaged('/work-orders', { status: '', kind: '' });
  const agents = useData((u) => ops(u), '/agents');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useAction();
  const people = (agents.data?.agents ?? []).map((a: any) => ({ value: a.id, label: a.fullName }));
  const assign = (id: string, assigneeId: string) => assigneeId && run(async () => { await ops(`/work-orders/${id}/assign`, { body: { assigneeId } }); list.reload(); }, 'Job assigned');
  const cancel = (id: string) => window.confirm('Cancel this job?') && run(async () => { await ops(`/work-orders/${id}/cancel`, { method: 'POST' }); list.reload(); }, 'Job cancelled');
  const f = (k: keyof typeof EMPTY) => ({ value: form?.[k] ?? '', onChange: (e: React.ChangeEvent<any>) => setForm({ ...form!, [k]: e.target.value }) });

  return (
    <>
      <PageTitle title="Work orders" actions={<Button onClick={() => setForm(EMPTY)}>New job</Button>} />
      <div className="mb-3 flex gap-2">
        <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['OPEN', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((v) => ({ value: v, label: label(v) }))]} />
        <Select className="w-auto" aria-label="Kind" value={list.filters.kind} onChange={(e) => list.setFilter('kind', e.target.value)} options={[{ value: '', label: 'Any type' }, ...KINDS.map((v) => ({ value: v, label: label(v) }))]} />
      </div>
      <Table loading={list.loading} rows={list.items} empty="No jobs." columns={[
        { key: 'number', title: 'Job', render: (r: any) => <div><b>{label(r.kind)}</b><p className="text-xs text-slate2-3">{r.number}</p></div> },
        { key: 'address', title: 'Location' },
        { key: 'priority', title: 'Priority', render: (r: any) => <Badge value={r.priority} /> },
        { key: 'status', title: 'Status', render: (r: any) => <Badge tone={r.status === 'DONE' ? 'green' : r.status === 'CANCELLED' ? 'gray' : 'blue'}>{label(r.status)}</Badge> },
        { key: 'who', title: 'Assigned to', render: (r: any) => (['OPEN', 'ASSIGNED'].includes(r.status) ? <Select aria-label="Assign" className="w-40 py-1 text-xs" value={r.assigneeId ?? ''} onChange={(e) => assign(r.id, e.target.value)} options={[{ value: '', label: 'Unassigned' }, ...people]} /> : r.assignee?.fullName ?? '—') },
        { key: 'when', title: 'Created', render: (r: any) => dateTime(r.createdAt) },
        { key: 'act', title: '', right: true, render: (r: any) => (['DONE', 'CANCELLED'].includes(r.status) ? null : <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => cancel(r.id)}>Cancel</Button>) },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="New job">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops('/work-orders', { body: { ...form, assigneeId: form!.assigneeId || undefined, scheduledFor: form!.scheduledFor || undefined } }); setForm(null); list.reload(); }, 'Job created'); }}>
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel text="Type"><Select {...f('kind')} options={KINDS} /></FieldLabel>
            <FieldLabel text="Priority"><Select {...f('priority')} options={['LOW', 'NORMAL', 'HIGH', 'URGENT']} /></FieldLabel>
          </div>
          <FieldLabel text="Location"><Input required minLength={3} {...f('address')} /></FieldLabel>
          <FieldLabel text="What needs doing?"><TextArea required minLength={3} {...f('description')} /></FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel text="Assign to"><Select {...f('assigneeId')} options={[{ value: '', label: 'Later' }, ...people]} /></FieldLabel>
            <FieldLabel text="Scheduled for"><Input type="datetime-local" {...f('scheduledFor')} /></FieldLabel>
          </div>
          <Button busy={busy} className="w-full">Create job</Button>
        </form>
      </Modal>
    </>
  );
}
