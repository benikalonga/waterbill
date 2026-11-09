import OpsShell from '@/components/OpsShell';

export const metadata = { title: { default: 'Operations', template: '%s · WaterBill Operations' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OpsShell>{children}</OpsShell>;
}
