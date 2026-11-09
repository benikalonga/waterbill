'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { ops } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { usePaged } from '@/lib/paged';
import { dateTime, label } from '@/lib/format';
import { Badge, Button, Input, Modal, PageTitle, Pager, Select, Table } from '@/components/ui';

function Ticket({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const { data, reload } = useData((u) => ops(u), id ? `/tickets/${id}` : null);
  const [body, setBody] = useState('');
  const { busy, run } = useAction();
  const t = data?.ticket?.id === id ? data.ticket : null;
  const update = (patch: object, msg: string) => run(async () => { await ops(`/tickets/${id}`, { method: 'PATCH', body: patch }); reload(); onChange(); }, msg);
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={t?.subject ?? 'Ticket'} wide>
      {t && (
        <div className="space-y-3 text-sm">
          <p className="text-slate2-3">{t.number} · {t.customer.firstName} {t.customer.lastName} ({t.customer.accountNumber}) · {t.customer.phone}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-mist p-3">
            {t.messages.map((m: any) => (
              <div key={m.id} className={clsx('flex', m.fromStaff ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[75%] rounded-xl px-3 py-2', m.fromStaff ? 'bg-tide-600 text-white' : 'bg-white')}>
                  <p className="text-[11px] font-semibold opacity-75">{m.authorName} · {dateTime(m.createdAt)}</p><p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await ops(`/tickets/${id}/messages`, { body: { body } }); setBody(''); reload(); onChange(); }); }}>
            <Input required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to the customer" /><Button busy={busy}>Send</Button>
          </form>
          {!['RESOLVED', 'CLOSED', 'REJECTED'].includes(t.status) && (
            <div className="flex gap-2">
              <Button variant="soft" busy={busy} onClick={() => { const resolution = window.prompt('How was this resolved? The customer will see this.'); if (resolution) update({ status: 'RESOLVED', resolution }, 'Ticket resolved'); }}>Resolve</Button>
              <Button variant="ghost" busy={busy} onClick={() => { const resolution = window.prompt('Why is this being rejected?'); if (resolution) update({ status: 'REJECTED', resolution }, 'Ticket rejected'); }}>Reject</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Tickets() {
  const list = usePaged('/tickets', { status: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PageTitle title="Support tickets" hint="Sorted by the nearest response deadline." />
      <div className="mb-3"><Select className="w-auto" aria-label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} options={[{ value: '', label: 'Any status' }, ...['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'].map((v) => ({ value: v, label: label(v) }))]} /></div>
      <Table loading={list.loading} rows={list.items} onRow={(r: any) => setOpenId(r.id)} empty="No tickets." columns={[
        { key: 'subject', title: 'Subject', render: (r: any) => <div><b>{r.subject}</b><p className="text-xs text-slate2-3">{r.number} · {label(r.topic)}</p></div> },
        { key: 'customer', title: 'Customer', render: (r: any) => `${r.customer.firstName} ${r.customer.lastName}` },
        { key: 'assignee', title: 'Handler', render: (r: any) => r.assignee?.fullName ?? 'Unassigned' },
        { key: 'sla', title: 'Respond by', render: (r: any) => { const late = new Date(r.slaDueAt) < new Date() && ['OPEN', 'IN_PROGRESS'].includes(r.status); return <span className={late ? 'font-semibold text-red-600' : ''}>{dateTime(r.slaDueAt)}</span>; } },
        { key: 'status', title: 'Status', render: (r: any) => <Badge value={r.status} /> },
      ]} />
      {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onChange={list.setPage} />}
      <Ticket id={openId} onClose={() => setOpenId(null)} onChange={list.reload} />
    </>
  );
}
