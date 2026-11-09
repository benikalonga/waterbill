'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { open } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Card, FieldLabel, Input, Select } from '@/components/ui';
import Logo from '@/components/Logo';

const EMPTY = { firstName: '', lastName: '', phone: '', email: '', type: 'HOUSEHOLD', tariffClass: 'STANDARD', addressLine: '', neighborhood: '', district: '', city: '', region: '' };
const STEPS = ['About you', 'Your address', 'Your service'];

export default function Register() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState<string | null>(null);
  const { busy, run } = useAction();
  const f = (k: keyof typeof EMPTY) => ({ value: form[k], onChange: (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value }) });

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) return setStep(step + 1);
    run(async () => setDone((await open('/auth/customer/register', { body: form })).accountNumber));
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center"><Link href="/"><Logo size={42} /></Link></div>
        <Card className="p-6">
          {done ? (
            <div className="text-center">
              <CheckCircle2 size={44} className="mx-auto text-tide-500" />
              <h1 className="mt-3 text-xl font-bold">Application received</h1>
              <p className="mt-1 text-sm text-slate2-2">Your account number is</p>
              <p className="mt-1 text-2xl font-bold tracking-wider text-tide-700">{done}</p>
              <p className="mt-3 text-sm text-slate2-2">We sent a one-time code to {form.phone}. Sign in with it to choose your PIN. Our team will then check your details.</p>
              <Link href={`/sign-in?account=${done}`} className="btn btn-primary mt-5 w-full">Sign in</Link>
            </div>
          ) : (
            <form onSubmit={next} className="space-y-3">
              <div className="flex gap-1.5">{STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-tide-500' : 'bg-edge'}`} />)}</div>
              <h1 className="pt-1 text-lg font-bold">{STEPS[step]}</h1>
              {step === 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldLabel text="First name"><Input required {...f('firstName')} /></FieldLabel>
                    <FieldLabel text="Last name"><Input required {...f('lastName')} /></FieldLabel>
                  </div>
                  <FieldLabel text="Mobile number" hint="We send your one-time code here."><Input required type="tel" placeholder="Include your country code" {...f('phone')} /></FieldLabel>
                  <FieldLabel text="Email (optional)"><Input type="email" {...f('email')} /></FieldLabel>
                </>
              )}
              {step === 1 && (
                <>
                  <FieldLabel text="Street address"><Input required minLength={3} {...f('addressLine')} /></FieldLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldLabel text="Neighborhood"><Input required {...f('neighborhood')} /></FieldLabel>
                    <FieldLabel text="District"><Input required {...f('district')} /></FieldLabel>
                    <FieldLabel text="City"><Input required {...f('city')} /></FieldLabel>
                    <FieldLabel text="Region"><Input required {...f('region')} /></FieldLabel>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <FieldLabel text="Customer type"><Select {...f('type')} options={['HOUSEHOLD', 'BUSINESS', 'INSTITUTION', 'GOVERNMENT', 'NGO', 'PUBLIC_STANDPIPE']} /></FieldLabel>
                  <FieldLabel text="Tariff" hint="Our team confirms the right tariff when reviewing your application."><Select {...f('tariffClass')} options={['LIFELINE', 'STANDARD', 'COMMERCIAL']} /></FieldLabel>
                </>
              )}
              <div className="flex gap-2 pt-1">
                {step > 0 && <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
                <Button type="submit" busy={busy} className="flex-1">{step < 2 ? 'Continue' : 'Submit application'}</Button>
              </div>
              <p className="text-center text-sm text-slate2-3">Already a customer? <Link href="/sign-in" className="text-tide-600 hover:underline">Sign in</Link></p>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
