'use client';

import { useActionState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COUNTRY_OPTIONS } from '@/lib/constants/countries';
import type { PublicTeam } from '@/lib/db/team-public';

import { updateTeamProfileAction } from './actions';
import { fetcher } from './settings-shared';

type TeamProfileUser = {
  id: number;
};

export function OrganizationProfileCard() {
  const { data: teamData, mutate } = useSWR<PublicTeam>('/api/team', fetcher);
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data: user } = useSWR<TeamProfileUser>('/api/user', fetcher);
  const currentRole = teamData?.members?.find((member) => member.user.id === user?.id)?.role;
  const [state, formAction, isPending] = useActionState(updateTeamProfileAction, {});

  useEffect(() => {
    if (state.success) {
      mutate();
      mutateGlobal('/api/orgs');
    }
  }, [state.success, mutate, mutateGlobal]);

  if (currentRole && currentRole !== 'owner') {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="teamName" className="mb-2">
              Organization name
            </Label>
            <Input
              id="teamName"
              name="teamName"
              defaultValue={teamData?.name ?? ''}
              placeholder="Your company or organization"
              required
              maxLength={120}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="taxId" className="mb-2">
                Tax ID (optional)
              </Label>
              <Input
                id="taxId"
                name="taxId"
                defaultValue={teamData?.taxId ?? ''}
                placeholder="EIN / VAT / GST"
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="domicileCountry" className="mb-2">
                Country of domicile (optional)
              </Label>
              <select
                id="domicileCountry"
                name="domicileCountry"
                defaultValue={teamData?.domicileCountry ?? 'United States'}
                className="border-input h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {teamData?.publicId ? (
            <p className="text-xs text-muted-foreground">Organization ID: {teamData.publicId}</p>
          ) : null}
          {state.error ? <p className="text-red-500 text-sm">{state.error}</p> : null}
          {state.success ? <p className="text-green-600 text-sm">{state.success}</p> : null}
          <Button
            type="submit"
            className="bg-white hover:bg-gray-100 text-black border border-gray-200 shadow-sm"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Organization'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
