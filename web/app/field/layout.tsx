'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ClipboardList, LogOut, Megaphone, Route } from 'lucide-react';
import { field, session } from '@/lib/api';
import { closeSocket, liveSocket } from '@/lib/socket';
import { Loading } from '@/components/ui';
import Logo from '@/components/Logo';

const NAV = [
  { href: '/field', label: 'Jobs', icon: ClipboardList },
  { href: '/field/route', label: 'Readings', icon: Route },
  { href: '/field/report', label: 'Report', icon: Megaphone },
];

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!session.get('staff')) return router.replace('/sign-in?as=staff');
    setReady(true);
    const socket = liveSocket('staff');
    const onJob = (j: { number: string }) => toast(`New job ${j.number}`, { icon: '🛠️', duration: 6000 });
    socket?.on('job:assigned', onJob);

    // Share position with the control room, by socket or by HTTP when offline.
    const watch = navigator.geolocation?.watchPosition((p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (socket?.connected) socket.emit('agent:position', pos);
      else field('/position', { body: pos }).catch(() => undefined);
    }, () => undefined, { enableHighAccuracy: false, maximumAge: 30000 });

    return () => {
      socket?.off('job:assigned', onJob);
      if (watch != null) navigator.geolocation.clearWatch(watch);
    };
  }, [router]);

  if (!ready) return <Loading />;
  const signOut = () => { closeSocket('staff'); session.clear('staff'); router.replace('/sign-in?as=staff'); };

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      <header className="flex items-center justify-between border-b border-edge bg-white px-4 py-3">
        <Logo size={26} />
        <button onClick={signOut} aria-label="Sign out" className="p-1.5 text-slate2-3"><LogOut size={18} /></button>
      </header>
      <main className="p-4">{children}</main>
      <nav className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t border-edge bg-white">
        <ul className="flex">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1"><Link href={href} className={clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', path === href ? 'text-tide-600' : 'text-slate2-3')}><Icon size={20} />{label}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
