'use client';
import { useState } from 'react';
import { portal } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { CHANNELS, dateTime, money, period } from '@/lib/format';
import { Badge, Failed, PageTitle, Pager, Table } from '@/components/ui';

export default function Payments() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData((u) => portal(u), `/payments?page=${page}`);
  if (error) return <Failed message={error} retry={reload} />;
  return (
    <>
      <PageTitle title="Payment history" />
      <Table loading={loading} rows={data?.items ?? []} empty="No payments yet." columns={[
        { key: 'date', title: 'Date', render: (r: any) => dateTime(r.confirmedAt ?? r.initiatedAt) },
        { key: 'reference', title: 'Reference', render: (r: any) => <code className="text-xs">{r.reference}</code> },
        { key: 'bill', title: 'Bill', render: (r: any) => (r.invoice ? period(r.invoice.period) : 'Account') },
        { key: 'channel', title: 'Method', render: (r: any) => CHANNELS[r.channel] },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'amount', title: 'Amount', right: true, render: (r: any) => <b>{money(r.amountCents)}</b> },
      ]} />
      {data && <Pager page={data.page} pages={data.pages} onChange={setPage} />}
    </>
  );
}
