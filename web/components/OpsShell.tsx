'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  BarChart3, Bell, Boxes, CalendarOff, ClipboardList, CreditCard, FileSpreadsheet, Gauge, Headset, History, LayoutDashboard, LogOut, Menu,
  Network, Percent, Scale, Settings, ShieldAlert, Siren, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { ops, request, session } from '@/lib/api';
import { closeSocket, liveSocket } from '@/lib/socket';
import { Loading } from '@/components/ui';
import Logo from '@/components/Logo';

const STAFF = createContext<any>(null);
export const useStaff = () => useContext(STAFF);

const OFFICE = ['EXECUTIVE', 'COMMERCIAL_MANAGER', 'TECHNICAL_MANAGER', 'BRANCH_MANAGER', 'BILLING_CLERK', 'COLLECTIONS_OFFICER', 'AUDITOR'];
const NAV: { group: string; items: { href: string; label: string; icon: any; roles?: string[] }[] }[] = [
  { group: 'Overview', items: [
    { href: '/ops', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/ops/reports', label: 'Water balance', icon: BarChart3, roles: ['EXECUTIVE', 'TECHNICAL_MANAGER', 'COMMERCIAL_MANAGER', 'AUDITOR', 'BRANCH_MANAGER'] },
    { href: '/ops/alerts', label: 'Alerts', icon: Siren },
  ] },
  { group: 'Commercial', items: [
    { href: '/ops/customers', label: 'Customers', icon: Users },
    { href: '/ops/meters', label: 'Meters', icon: Gauge },
    { href: '/ops/billing', label: 'Billing', icon: FileSpreadsheet },
    { href: '/ops/tariffs', label: 'Tariffs', icon: Percent },
    { href: '/ops/payments', label: 'Payments', icon: CreditCard },
    { href: '/ops/collections', label: 'Collections', icon: Wallet },
    { href: '/ops/tickets', label: 'Support', icon: Headset },
  ] },
  { group: 'Network', items: [
    { href: '/ops/network', label: 'Assets', icon: Network },
    { href: '/ops/losses', label: 'Leaks & fraud', icon: ShieldAlert },
    { href: '/ops/work', label: 'Work orders', icon: ClipboardList },
    { href: '/ops/outages', label: 'Outage notices', icon: CalendarOff },
  ] },
  { group: 'Back office', items: [
    { href: '/ops/people', label: 'HR & payroll', icon: Scale, roles: ['EXECUTIVE'] },
    { href: '/ops/inventory', label: 'Inventory', icon: Boxes },
    { href: '/ops/settings', label: 'Settings', icon: Settings },
    { href: '/ops/team', label: 'Team', icon: UserCog, roles: [] },
    { href: '/ops/audit', label: 'Audit log', icon: History, roles: ['AUDITOR'] },
  ] },
];

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [staff, setStaff] = useState<any>(null);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const s = session.get('staff');
    if (!s) return router.replace('/sign-in?as=staff');
    if (s.profile.role === 'FIELD_AGENT') return router.replace('/field');
    setStaff(s.profile);
    ops('/notifications').then((r) => setUnread(r.unread)).catch(() => undefined);
    const socket = liveSocket('staff');
    const onAlert = (a: { severity: string; title: string }) => { if (['HIGH', 'CRITICAL'].includes(a.severity)) toast.error(a.title, { duration: 8000 }); };
    const onNote = () => setUnread((c) => c + 1);
    socket?.on('alert:new', onAlert);
    socket?.on('notification', onNote);
    return () => { socket?.off('alert:new', onAlert); socket?.off('notification', onNote); };
  }, [router]);

  useEffect(() => setMenu(false), [path]);
  if (!staff) return <Loading />;

  const signOut = async () => {
    const s = session.get('staff');
    if (s) await request(null, '/auth/sign-out', { body: { refreshToken: s.refreshToken } }).catch(() => undefined);
    closeSocket('staff');
    session.clear('staff');
    router.replace('/sign-in?as=staff');
  };
  const canSee = (roles?: string[]) => staff.role === 'ADMIN' || (roles ? roles.includes(staff.role) : OFFICE.includes(staff.role));

  const sidebar = (
    <aside className="flex h-full w-60 flex-col bg-tide-900 text-white">
      <div className="flex items-center justify-between px-4 py-4"><Logo size={28} light /><button className="lg:hidden" aria-label="Close menu" onClick={() => setMenu(false)}><X size={20} /></button></div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => canSee(i.roles));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-tide-300/70">{g.group}</p>
              {items.map(({ href, label, icon: Icon }) => {
                const active = href === '/ops' ? path === href : path.startsWith(href);
                return <Link key={href} href={href} className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium', active ? 'bg-tide-600 text-white' : 'text-tide-100/80 hover:bg-white/5')}><Icon size={16} />{label}</Link>;
              })}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3 text-sm">
        <p className="truncate font-semibold">{staff.fullName}</p>
        <p className="truncate text-xs text-tide-200/70">{staff.role.replace(/_/g, ' ').toLowerCase()}</p>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-semibold text-tide-100/80 hover:text-white"><LogOut size={13} /> Sign out</button>
          <span className="flex items-center gap-1 text-xs text-tide-200/70"><Bell size={13} /> {unread}</span>
        </div>
      </div>
    </aside>
  );

  return (
    <STAFF.Provider value={staff}>
      <div className="min-h-screen lg:pl-60">
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
        {menu && <div className="fixed inset-0 z-50 flex bg-slate2/40 lg:hidden" onClick={() => setMenu(false)}><div onClick={(e) => e.stopPropagation()}>{sidebar}</div></div>}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-white px-4 py-2.5 lg:hidden">
          <button aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={22} /></button><Logo size={24} />
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </STAFF.Provider>
  );
}
