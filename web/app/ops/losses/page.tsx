'use client';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { dateTime, label, money } from '@/lib/format';
import { Badge, Button, FieldLabel, Input, Modal, PageTitle, Pager, Select, Table, Tabs, TextArea } from '@/components/ui';

export default function Losses() {
  const [tab, setTab] = useState('leaks');
  const leaks = usePaged('/leaks', { status: '' });
  const illegal = usePaged('/illegal-connections', { status: '' });
  const agents = useData((u) => ops(u), '/agents');
  const [dispatch, setDispatch] = useState<any>(null);
  const [assignee, setAssignee] = useState('');
  const [adding, setAdding] = useState<any>(null);
  const { busy, run } = useAction();
  const setIllegal = (id: string, status: string) => run(async () => { await ops(`/illegal-connections/${id}`, { method: 'PATCH', body: { status } }); illegal.reload(); }, 'Case updated');
  const setLeak = (id: string, status: string) => run(async () => { await ops(`/leaks/${id}`, { method: 'PATCH', body: { status } }); leaks.reload(); }, 'Leak updated');

  return (
    <>
      <PageTitle title="Leaks & fraud" actions={<Button onClick={() => setAdding({ kind: tab, address: '', description: '' })}>Log {tab === 'leaks' ? 'a leak' : 'a case'}</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'leaks', label: 'Leaks' }, { value: 'illegal', label: 'Illegal connections' }]} />
      {tab === 'leaks' ? (
        <>
          <div className="mb-3"><Select className="w-auto" aria-label="Status" value={leaks.filters.status} onChange={(e) => leaks.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['REPORTED', 'CONFIRMED', 'IN_REPAIR', 'REPAIRED', 'CLOSED'].map((v) => ({ value: v, label: label(v) }))]} /></div>
          <Table loading={leaks.loading} rows={leaks.items} empty="No leaks." columns={[
            { key: 'address', title: 'Location', render: (r: any) => <div><b>{r.address}</b><p className="text-xs text-slate2-3">{r.description}</p></div> },
            { key: 'source', title: 'Source', render: (r: any) => label(r.source) },
            { key: 'loss', title: 'Loss', render: (r: any) => (r.lossM3H ? `${r.lossM3H} m³/h` : '—') },
            { key: 'when', title: 'Reported', render: (r: any) => dateTime(r.reportedAt) },
            { key: 'priority', title: 'Priority', render: (r: any) => <Badge value={r.priority} /> },
            { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
            { key: 'act', title: '', right: true, render: (r: any) => (r.workOrder ? <span className="text-xs text-slate2-3">{r.workOrder.number}</span> : r.status === 'CLOSED' ? null : <div className="flex justify-end gap-1.5"><Button className="px-2.5 py-1 text-xs" onClick={() => setDispatch(r)}>Dispatch</Button><Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => setLeak(r.id, 'CLOSED')}>Close</Button></div>) },
          ]} />
          {leaks.data && <Pager page={leaks.data.page} pages={leaks.data.pages} total={leaks.data.total} onChange={leaks.setPage} />}
        </>
      ) : (
        <>
          <div className="mb-3"><Select className="w-auto" aria-label="Status" value={illegal.filters.status} onChange={(e) => illegal.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['DETECTED', 'VERIFYING', 'CONFIRMED', 'PENALIZED', 'REGULARIZED', 'DISPUTED'].map((v) => ({ value: v, label: label(v) }))]} /></div>
          <Table loading={illegal.loading} rows={illegal.items} empty="No cases." columns={[
            { key: 'address', title: 'Location', render: (r: any) => <div><b>{r.address}</b><p className="text-xs text-slate2-3">{r.notes}</p></div> },
            { key: 'source', title: 'Source', render: (r: any) => label(r.source) },
            { key: 'loss', title: 'Estimated loss', render: (r: any) => (r.estimatedLossCents ? money(r.estimatedLossCents) : '—') },
            { key: 'when', title: 'Detected', render: (r: any) => dateTime(r.detectedAt) },
            { key: 'status', title: 'Status', render: (r: any) => <Select aria-label="Change status" className="w-36 py-1 text-xs" value={r.status} onChange={(e) => setIllegal(r.id, e.target.value)} options={['DETECTED', 'VERIFYING', 'CONFIRMED', 'PENALIZED', 'REGULARIZED', 'DISPUTED']} /> },
          ]} />
          {illegal.data && <Pager page={illegal.data.page} pages={illegal.data.pages} total={illegal.data.total} onChange={illegal.setPage} />}
        </>
      )}
      <Modal open={Boolean(dispatch)} onClose={() => setDispatch(null)} title="Send a repair crew">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops(`/leaks/${dispatch.id}/dispatch`, { body: { assigneeId: assignee || undefined } }); setDispatch(null); leaks.reload(); }, 'Repair job created'); }}>
          <p className="text-sm">{dispatch?.address}</p>
          <FieldLabel text="Assign to"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: '', label: 'Leave unassigned' }, ...(agents.data?.agents ?? []).map((a: any) => ({ value: a.id, label: `${a.fullName} (${a._count.workOrders} open)` }))]} /></FieldLabel>
          <Button busy={busy} className="w-full">Create repair job</Button>
        </form>
      </Modal>
      <Modal open={Boolean(adding)} onClose={() => setAdding(null)} title={adding?.kind === 'leaks' ? 'Log a leak' : 'Log an illegal connection'}>
        {adding && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
            if (adding.kind === 'leaks') { await ops('/leaks', { body: { address: adding.address, description: adding.description || undefined } }); leaks.reload(); }
            else { await ops('/illegal-connections', { body: { address: adding.address, notes: adding.description || undefined } }); illegal.reload(); }
            setAdding(null);
          }, 'Saved'); }}>
            <FieldLabel text="Location"><Input required minLength={3} value={adding.address} onChange={(e) => setAdding({ ...adding, address: e.target.value })} /></FieldLabel>
            <FieldLabel text="Details"><TextArea value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></FieldLabel>
            <Button busy={busy} className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
