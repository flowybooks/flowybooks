import { AccountSettingsCard, PasswordSettingsCard } from './account-settings-card';
import { OrganizationProfileCard } from './team-profile-card';
import packageJson from '@/package.json';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const displayVersion = `v${packageJson.version.replace(/\.0$/, '')}`;

export default function SettingsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Local Settings</h1>
      <OrganizationProfileCard />
      <AccountSettingsCard />
      <PasswordSettingsCard />
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>About Flowybooks</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium">{displayVersion}</dd>
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
