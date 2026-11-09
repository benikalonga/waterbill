'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { portal } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { ago } from '@/lib/format';
import { Card, Empty, Failed, Loading, PageTitle } from '@/components/ui';

export default function Notifications() {
  const { data, error, reload } = useData((u) => portal(u), '/notifications');
  useEffect(() => { if (data?.unread) portal('/notifications/read', { method: 'POST' }).catch(() => undefined); }, [data?.unread]);
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle title="Notifications" />
      <Card className="divide-y divide-edge">
        {data.items.map((n: any) => {
          const body = (
            <div className={`p-4 ${n.readAt ? '' : 'bg-tide-50/60'}`}>
              <div className="flex justify-between gap-3"><p className="text-sm font-bold">{n.title}</p><span className="flex-shrink-0 text-xs text-slate2-3">{ago(n.createdAt)}</span></div>
              <p className="mt-0.5 text-sm text-slate2-2">{n.body}</p>
            </div>
          );
          return n.link ? <Link key={n.id} href={n.link} className="block">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
        {!data.items.length && <Empty icon={Bell} title="Nothing new" />}
      </Card>
    </>
  );
}
