import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { toPublicTeam } from '@/lib/db/team-public';
import { SWRConfig } from 'swr';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Flowybooks',
  description:
    'A local-first bookkeeping app for accounts, journals, reports, and statement imports.',
  applicationName: 'Flowybooks',
  creator: 'Flowybooks contributors',
  metadataBase: new URL(process.env.BASE_URL || 'http://localhost:3000'),
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
};

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`bg-background text-foreground dark ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-[100dvh] bg-background font-sans antialiased">
        <ThemeProvider>
          <SWRConfig
            value={{
              fallback: {
                // We do NOT await here
                // Only components that read this data will suspend
                '/api/user': getUser(),
                '/api/team': getTeamForUser().then((team) => (team ? toPublicTeam(team) : null)),
              },
            }}
          >
            {children}
          </SWRConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
