'use client';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { field } from '@/lib/api';
import { useAction, useData } from '@/lib/hooks';
import { m3 } from '@/lib/format';
import { Button, Card, Empty, Failed, Input, Loading, PageTitle } from '@/components/ui';

export default function ReadingRoute() {
  const { data, error, reload } = useData((u) => field(u), '/route');
  const [values, setValues] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  if (error) return <Failed message={error} retry={reload} />;
  if (!data) return <Loading />;

  const submit = (meterId: string) => run(async () => {
    const pos = await new Promise<{ lat?: number; lng?: number }>((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve({}), { timeout: 4000 });
    });
    const { reading } = await field('/readings', { body: { meterId, totalLitres: Math.round(Number(values[meterId]) * 1000), ...pos } });
    reload();
    return reading;
  }, 'Reading saved');

  return (
    <div className="space-y-3">
      <PageTitle title="Reading route" hint={`${data.meters.length} meters left this month`} />
      {data.meters.map((m: any) => (
        <Card key={m.id} className="p-4">
          <p className="font-bold">{m.customer.firstName} {m.customer.lastName}</p>
          <p className="text-sm text-slate2-2">{m.customer.addressLine}</p>
          <p className="text-xs text-slate2-3">Meter {m.serial} · last index {m3(m.lastLitres)}</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(m.id); }}>
            <Input required type="number" min="0" step="0.001" placeholder="New index (m³)" value={values[m.id] ?? ''} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} />
            <Button busy={busy}>Save</Button>
          </form>
        </Card>
      ))}
      {!data.meters.length && <Card><Empty icon={CheckCircle2} title="Route complete" hint="Every meter on your route has been read." /></Card>}
    </div>
  );
}
