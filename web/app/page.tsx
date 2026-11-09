'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, BellRing, CalendarClock, Droplets, ShieldCheck, Smartphone } from 'lucide-react';
import { open, session } from '@/lib/api';
import { useData } from '@/lib/hooks';
import { date, label, money } from '@/lib/format';
import { Badge, Button, Card, FieldLabel, Input, Select } from '@/components/ui';
import Logo from '@/components/Logo';

const FEATURES = [
  { icon: Smartphone, title: 'Pay from your phone', text: 'Settle bills by mobile money or card and get a receipt at once.' },
  { icon: Activity, title: 'See your usage', text: 'Follow consumption month by month and set your own limit.' },
  { icon: BellRing, title: 'Leak warnings', text: 'We tell you when your use looks unusual, before the bill does.' },
  { icon: CalendarClock, title: 'Payment plans', text: 'Behind on a bill? Spread it over several months.' },
  { icon: Droplets, title: 'Outage notices', text: 'Know about planned works and interruptions in your area.' },
  { icon: ShieldCheck, title: 'Fair, clear bills', text: 'Every bill shows exactly how each cubic metre was priced.' },
];

function Calculator() {
  const [tariffClass, setClass] = useState('STANDARD');
  const [m3, setM3] = useState('15');
  const [result, setResult] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (m3 === '' || Number(m3) < 0) return setResult(null);
      open('/public/estimate', { body: { tariffClass, m3: Number(m3) } }).then(setResult).catch(() => setResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [tariffClass, m3]);

  return (
    <Card className="p-5 text-slate2 shadow-xl">
      <h2 className="font-bold">Estimate your bill</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <FieldLabel text="Tariff"><Select value={tariffClass} onChange={(e) => setClass(e.target.value)} options={['LIFELINE', 'STANDARD', 'COMMERCIAL', 'INDUSTRIAL']} /></FieldLabel>
        <FieldLabel text="Monthly use (m³)"><Input type="number" min="0" value={m3} onChange={(e) => setM3(e.target.value)} /></FieldLabel>
      </div>
      {result && (
        <div className="mt-4 space-y-1 text-sm">
          {result.lines.map((l: any) => <div key={l.label} className="flex justify-between text-slate2-2"><span>{l.label}</span><span>{money(l.cents)}</span></div>)}
          <div className="flex justify-between text-slate2-2"><span>Fixed charge</span><span>{money(result.fixedCents)}</span></div>
          <div className="flex justify-between text-slate2-2"><span>VAT</span><span>{money(result.vatCents)}</span></div>
          <div className="mt-2 flex items-baseline justify-between border-t border-edge pt-2"><span className="font-semibold">Estimated total</span><span className="text-2xl font-bold text-tide-600">{money(result.totalCents)}</span></div>
        </div>
      )}
    </Card>
  );
}

export default function Landing() {
  const [home, setHome] = useState<string | null>(null);
  const outages = useData((u) => open(u), '/public/outages');

  useEffect(() => {
    if (session.get('customer')) setHome('/portal');
    else if (session.get('staff')) setHome(session.get('staff')!.profile.role === 'FIELD_AGENT' ? '/field' : '/ops');
  }, []);

  return (
    <main>
      <section className="bg-tide-900 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <nav className="flex items-center justify-between py-5">
            <Logo light />
            <div className="flex gap-2">
              {home ? <Link href={home} className="btn btn-primary">Open my account</Link> : (
                <>
                  <Link href="/sign-in" className="btn text-white hover:bg-white/10">Sign in</Link>
                  <Link href="/register" className="btn btn-primary">Open an account</Link>
                </>
              )}
            </div>
          </nav>
          <div className="grid items-center gap-10 pb-16 pt-8 md:grid-cols-2">
            <div>
              <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Water bills that make sense.</h1>
              <p className="mt-4 max-w-md text-lg text-tide-100">Check your usage, pay in seconds and report a problem, all from your phone.</p>
              <div className="mt-6 flex gap-3">
                <Link href="/register" className="btn bg-coral px-6 py-3 text-white hover:bg-coral-dark">Get started</Link>
                <Link href="/sign-in" className="btn border border-white/30 px-6 py-3 text-white hover:bg-white/10">I have an account</Link>
              </div>
            </div>
            <Calculator />
          </div>
        </div>
      </section>

      {outages.data?.outages?.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pt-10">
          <h2 className="mb-3 text-xl font-bold">Service notices</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {outages.data.outages.map((o: any) => (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{o.title}</p><Badge value={o.status} /></div>
                <p className="mt-1 text-sm text-slate2-2">{o.message}</p>
                <p className="mt-2 text-xs text-slate2-3">{o.zone?.name ?? 'All areas'} · {label(o.kind)} · from {date(o.startsAt)}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tide-50 text-tide-600"><Icon size={20} /></span>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-slate2-2">{text}</p>
            </Card>
          ))}
        </div>
      </section>
      <footer className="border-t border-edge py-6 text-center text-sm text-slate2-3">
        WaterBill · <Link href="/sign-in?as=staff" className="hover:underline">Staff sign in</Link>
      </footer>
    </main>
  );
}
