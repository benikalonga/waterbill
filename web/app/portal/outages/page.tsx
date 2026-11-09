'use client';
import { open } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { dateTime, label } from '@/lib/format';
import { Badge, Card, Empty, Failed, Loading, PageTitle } from '@/components/ui';
import { CheckCircle2 } from 'lucide-react';

export default function Outages() {
  const { data, error, reload } = useData((u) => open(u), '/public/outages');
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-3">
      <PageTitle title="Service notices" />
      {data.outages.map((o: any) => (
        <Card key={o.id} className="p-4">
          <div className="flex items-start justify-between gap-2"><p className="font-bold">{o.title}</p><Badge value={o.status} /></div>
          <p className="mt-1 text-sm text-slate2-2">{o.message}</p>
          <p className="mt-2 text-xs text-slate2-3">{o.zone?.name ?? 'All areas'} · {label(o.kind)} · {dateTime(o.startsAt)}{o.endsAt ? ` to ${dateTime(o.endsAt)}` : ''}</p>
        </Card>
      ))}
      {!data.outages.length && <Card><Empty icon={CheckCircle2} title="No interruptions planned" /></Card>}
    </div>
  );
}
