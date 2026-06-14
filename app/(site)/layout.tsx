import { SiteHeader } from '@/components/site-header';
import { getUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <section
      className="flex min-h-screen flex-col bg-transparent"
      style={{ '--app-header-height': '4rem' } as Record<string, string>}
    >
      <SiteHeader user={user} />
      {children}
    </section>
  );
}
