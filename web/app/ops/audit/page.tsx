'use client';
import { usePaged } from '@/lib/paged';
import { dateTime, label } from '@/lib/format';
import { PageTitle, Pager, SearchBox, Table } from '@/components/ui';

export default function Audit() {
  const list = usePaged('/audit', { entity: '' });
  return (
    <>
      <PageTitle title="Audit log" hint="Every sensitive action taken by staff." />
      <div className="mb-3"><SearchBox value={list.filters.entity} onChange={(v) => list.setFilter('entity', v)} placeholder="Filter by record type, e.g. Invoice" /></div>
      <Table loading={list.loading} rows={list.items} empty="Nothing recorded." columns={[
        { key: 'when', title: 'When', render: (r: any) => dateTime(r.createdAt) },
        { key: 'who', title: 'Who', render: (r: any) => <div>{r.staff.fullName}<p className="text-xs text-slate2-3">{label(r.staff.role)}</p></div> },
        { key: 'action', title: 'Action', render: (r: any) => <code className="text-xs">{r.action}</code> },
        { key: 'entity', title: 'Record', render: (r: any) => <span>{r.entity} <span className="text-xs text-slate2-3">{r.entityId?.slice(-8)}</span></span> },
        { key: 'detail', title: 'Detail', render: (r: any) => <code className="block max-w-xs truncate text-xs text-slate2-3">{r.detail ? JSON.stringify(r.detail) : ''}</code> },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
    </>
  );
}
