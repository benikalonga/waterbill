'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { portal } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { liveSocket } from '@/lib/socket';
import { dateTime, label } from '@/lib/format';
import { Badge, Button, Card, Failed, Input, Loading, PageTitle } from '@/components/ui';

export default function TicketView({ params }: { params: { id: string } }) {
  const { data, error, reload } = useData((u) => portal(u), `/tickets/${params.id}`);
  const [body, setBody] = useState('');
  const { busy, run } = useAction();

  useEffect(() => {
    const socket = liveSocket('customer');
    const onMessage = (m: { ticketId: string }) => { if (m.ticketId === params.id) reload(); };
    socket?.on('ticket:message', onMessage);
    return () => { socket?.off('ticket:message', onMessage); };
  }, [params.id, reload]);

  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;
  const t = data.ticket;
  const closed = ['CLOSED', 'REJECTED'].includes(t.status);
  const done = t.status === 'RESOLVED' || t.status === 'CLOSED';

  return (
    <div className="space-y-3">
      <PageTitle title={t.subject} hint={`${t.number} · ${label(t.topic)}`} actions={<Badge value={t.status} />} />
      <div className="space-y-2">
        {t.messages.map((m: any) => (
          <div key={m.id} className={clsx('flex', m.fromStaff ? 'justify-start' : 'justify-end')}>
            <div className={clsx('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm', m.fromStaff ? 'bg-white' : 'bg-tide-600 text-white')}>
              <p className={clsx('mb-0.5 text-[11px] font-semibold', m.fromStaff ? 'text-tide-600' : 'text-tide-100')}>{m.authorName} · {dateTime(m.createdAt)}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      {t.resolution && <Card className="p-4 text-sm"><b>Resolution:</b> {t.resolution}</Card>}
      {done && (
        <Card className="flex items-center justify-between p-4 text-sm">
          <span className="font-semibold">{t.rating ? 'Thanks for your rating' : 'How did we do?'}</span>
          <span className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} stars`} disabled={busy} onClick={() => run(async () => { await portal(`/tickets/${t.id}/rating`, { body: { rating: n } }); reload(); })}>
                <Star size={22} className={n <= (t.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate2-4'} />
              </button>
            ))}
          </span>
        </Card>
      )}
      {!closed && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await portal(`/tickets/${t.id}/messages`, { body: { body } }); setBody(''); reload(); }); }}>
          <Input required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply" />
          <Button busy={busy}>Send</Button>
        </form>
      )}
    </div>
  );
}
