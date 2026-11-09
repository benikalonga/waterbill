'use client';
import { useEffect } from 'react';
import { ops } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { liveSocket } from '@/lib/socket';
import { ago, label } from '@/lib/format';
import { Badge, Button, PageTitle, Pager, Select, Table } from '@/components/ui';

export default function Alerts() {
  const list = usePaged('/alerts', { status: 'NEW', severity: '' });
  const { busy, run } = useAction();
  const { reload } = list;
  useEffect(() => {
    const socket = liveSocket('staff');
    const refresh = () => reload();
    socket?.on('alert:new', refresh);
    return () => { socket?.off('alert:new', refresh); };
  }, [reload]);
  const set = (id: string, status: string, msg: string) => run(async () => { await ops(`/alerts/${id}`, { method: 'PATCH', body: { status } }); reload(); }, msg);
  return (
    <>
      <PageTitle title="Alerts" hint="Raised automatically from meters, stations and stock levels." />
      <div className="mb-3 flex gap-2">
        <Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].map((v) => ({ value: v, label: label(v) }))]} />
        <Select className="w-auto" aria-label="Severity" value={list.filters.severity} onChange={(e) => list.setFilter('severity', e.target.value)} options={[{ value: '', label: 'Any severity' }, ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((v) => ({ value: v, label: label(v) }))]} />
      </div>
      <Table loading={list.loading} rows={list.items} empty="No alerts here." columns={[
        { key: 'severity', title: 'Severity', render: (r: any) => <Badge value={r.severity} /> },
        { key: 'title', title: 'Alert', render: (r: any) => <div><b>{r.title}</b><p className="text-xs text-slate2-3">{r.detail}</p></div> },
        { key: 'customer', title: 'Customer', render: (r: any) => (r.customer ? `${r.customer.firstName} ${r.customer.lastName}` : '—') },
        { key: 'when', title: 'Raised', render: (r: any) => ago(r.createdAt) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'act', title: '', right: true, render: (r: any) => (
          <div className="flex justify-end gap-1.5">
            {r.status === 'NEW' && <Button variant="soft" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => set(r.id, 'IN_PROGRESS', 'Alert acknowledged')}>Acknowledge</Button>}
            {['NEW', 'IN_PROGRESS'].includes(r.status) && <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => set(r.id, 'RESOLVED', 'Alert resolved')}>Resolve</Button>}
            {r.status === 'NEW' && <Button variant="ghost" className="px-2.5 py-1 text-xs" busy={busy} onClick={() => set(r.id, 'DISMISSED', 'Alert dismissed')}>Dismiss</Button>}
          </div>
        ) },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
    </>
  );
}
