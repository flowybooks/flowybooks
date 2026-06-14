'use client';

import { useActionState } from 'react';
import useSWR from 'swr';
import { Loader2, Lock } from 'lucide-react';

import { updateAccount, updatePassword } from '@/app/(login)/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { fetcher } from './settings-shared';

type AccountSettingsUser = {
  name: string | null;
  email: string;
};

type AccountState = {
  name?: string;
  error?: string;
  success?: string;
};

type PasswordState = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  error?: string;
  success?: string;
};

export function AccountSettingsCard() {
  const { data: user } = useSWR<AccountSettingsUser>('/api/user', fetcher);
  const [state, formAction, isPending] = useActionState<AccountState, FormData>(updateAccount, {});

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction}>
          <div>
            <Label htmlFor="name" className="mb-2">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Your name"
              defaultValue={state.name ?? user?.name ?? ''}
              required
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="email" className="mb-2">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Email address"
              defaultValue={user?.email ?? ''}
              required
              maxLength={255}
            />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-green-600">{state.success}</p> : null}
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Account'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordSettingsCard() {
  const [state, formAction, isPending] = useActionState<PasswordState, FormData>(
    updatePassword,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction}>
          <div>
            <Label htmlFor="current-password" className="mb-2">
              Current Password
            </Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={100}
              defaultValue={state.currentPassword}
            />
          </div>
          <div>
            <Label htmlFor="new-password" className="mb-2">
              New Password
            </Label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              defaultValue={state.newPassword}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password" className="mb-2">
              Confirm New Password
            </Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              maxLength={100}
              defaultValue={state.confirmPassword}
            />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-green-600">{state.success}</p> : null}
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Update Password
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
