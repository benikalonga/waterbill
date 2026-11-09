import PortalShell from '@/components/PortalShell';

export const metadata = { title: 'My account' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
