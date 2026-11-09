'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Bell, FileText, Gauge, Home, LifeBuoy, User } from 'lucide-react';
import { portal, session } from '@/lib/api';
import { liveSocket } from '@/lib/socket';
import { Loading } from '@/components/ui';
import Logo from '@/components/Logo';

const NAV = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/bills', label: 'Bills', icon: FileText },
  { href: '/portal/usage', label: 'Usage', icon: Gauge },
  { href: '/portal/support', label: 'Support', icon: LifeBuoy },
  { href: '/portal/account', label: 'Account', icon: User },
];

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const s = session.get('customer');
    if (!s) return router.replace('/sign-in');
    if (s.profile.mustChangePin && path !== '/portal/account') return router.replace('/portal/account?setPin=1');
    setReady(true);
  }, [router, path]);

  useEffect(() => {
    if (!ready) return;
    portal('/notifications').then((r) => setUnread(r.unread)).catch(() => undefined);
    const socket = liveSocket('customer');
    const onNote = (n: { body: string }) => { setUnread((c) => c + 1); toast(n.body, { icon: '💧', duration: 5000 }); };
    socket?.on('notification', onNote);
    return () => { socket?.off('notification', onNote); };
  }, [ready]);

  useEffect(() => { if (path === '/portal/notifications') setUnread(0); }, [path]);

  if (!ready) return <Loading />;

  const active = (href: string) => (href === '/portal' ? path === href : path.startsWith(href));
  return (
    <div className="min-h-screen pb-20 sm:pb-8">
      <header className="no-print sticky top-0 z-40 border-b border-edge bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/portal"><Logo size={28} /></Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold', active(n.href) ? 'bg-tide-50 text-tide-700' : 'text-slate2-2 hover:bg-mist')}>{n.label}</Link>)}
          </nav>
          <Link href="/portal/notifications" aria-label="Notifications" className="relative rounded-full p-2 hover:bg-mist">
            <Bell size={20} />
            {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[17px] rounded-full bg-coral px-1 text-center text-[10px] font-bold leading-[17px] text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
      <nav className="no-print fixed bottom-0 left-0 right-0 z-40 border-t border-edge bg-white sm:hidden">
        <ul className="flex">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link href={href} className={clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', active(href) ? 'text-tide-600' : 'text-slate2-3')}><Icon size={20} />{label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
