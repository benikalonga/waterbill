'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { portal } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { date, m3, money, period } from '@/lib/format';
import { Badge, Failed, PageTitle, Pager, Table } from '@/components/ui';

export default function Bills() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData((u) => portal(u), `/invoices?page=${page}`);
  if (error) return <Failed message={error} retry={reload} />;
  return (
    <>
      <PageTitle title="My bills" actions={<Link href="/portal/payments" className="btn btn-ghost">Payment history</Link>} />
      <Table loading={loading} rows={data?.items ?? []} empty="You have no bills yet." onRow={(r: any) => router.push(`/portal/bills/${r.id}`)} columns={[
        { key: 'period', title: 'Period', render: (r: any) => <b>{period(r.period)}</b> },
        { key: 'usage', title: 'Used', render: (r: any) => m3(r.usageLitres) },
        { key: 'due', title: 'Due', render: (r: any) => date(r.dueAt) },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
        { key: 'total', title: 'Total', right: true, render: (r: any) => <b>{money(r.totalCents + r.penaltyCents)}</b> },
      ]} />
      {data && <Pager page={data.page} pages={data.pages} onChange={setPage} />}
    </>
  );
}
