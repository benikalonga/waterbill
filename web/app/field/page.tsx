'use client';
import { useState } from 'react';
import { MapPin, Phone, Wrench } from 'lucide-react';
import { field } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { dateTime, label } from '@/lib/format';
import { Badge, Button, Card, Empty, Failed, FieldLabel, Loading, Modal, PageTitle, TextArea } from '@/components/ui';

export default function Jobs() {
  const { data, error, reload } = useData((u) => field(u), '/jobs');
  const [finishing, setFinishing] = useState<any>(null);
  const [report, setReport] = useState('');
  const { busy, run } = useAction();
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;

  const step = (id: string, s: string) => run(async () => { await field(`/jobs/${id}/${s}`, { method: 'POST' }); reload(); });

  return (
    <div className="space-y-3">
      <PageTitle title="My jobs" hint={`${data.jobs.length} open`} />
      {data.jobs.map((j: any) => (
        <Card key={j.id} className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-bold">{label(j.kind)}</p><p className="text-xs text-slate2-3">{j.number}</p></div>
            <div className="flex gap-1"><Badge value={j.priority} /><Badge tone="teal">{label(j.status)}</Badge></div>
          </div>
          <p className="flex items-start gap-1.5 text-sm"><MapPin size={15} className="mt-0.5 flex-shrink-0 text-tide-600" />{j.address}</p>
          <p className="text-sm text-slate2-2">{j.description}</p>
          {j.scheduledFor && <p className="text-xs text-slate2-3">Scheduled {dateTime(j.scheduledFor)}</p>}
          <div className="flex gap-2 pt-1">
            {j.customer && <a href={`tel:${j.customer.phone}`} className="btn btn-ghost"><Phone size={15} /> Call</a>}
            {(j.lat != null) && <a href={`https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}`} target="_blank" rel="noreferrer" className="btn btn-ghost">Directions</a>}
            {j.status === 'ASSIGNED' && <Button busy={busy} className="flex-1" onClick={() => step(j.id, 'accept')}>Accept</Button>}
            {j.status === 'ACCEPTED' && <Button busy={busy} className="flex-1" onClick={() => step(j.id, 'start')}>Start</Button>}
            {j.status === 'IN_PROGRESS' && <Button className="flex-1" onClick={() => setFinishing(j)}>Complete</Button>}
          </div>
        </Card>
      ))}
      {!data.jobs.length && <Card><Empty icon={Wrench} title="No jobs right now" hint="New work appears here as soon as it is assigned." /></Card>}

      <Modal open={Boolean(finishing)} onClose={() => setFinishing(null)} title={`Complete ${finishing?.number ?? ''}`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await field(`/jobs/${finishing.id}/complete`, { body: { report } }); setFinishing(null); setReport(''); reload(); }, 'Job completed'); }}>
          <FieldLabel text="What was done?"><TextArea required minLength={3} rows={4} value={report} onChange={(e) => setReport(e.target.value)} /></FieldLabel>
          <Button busy={busy} className="w-full">Finish job</Button>
        </form>
      </Modal>
    </div>
  );
}
