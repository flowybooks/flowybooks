'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth/better-auth/client';
import { COUNTRY_OPTIONS } from '@/lib/constants/countries';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const noticeParam = searchParams.get('notice');
  const prefillEmail = searchParams.get('email');

  const noticeFromParam = (value: string | null) => {
    if (value === 'account-created') {
      return 'Account created. Sign in to finish opening your workspace.';
    }
    return null;
  };

  const switchAuthHref = mode === 'signin' ? '/sign-up' : '/sign-in';
  const forgotPasswordHref = '/forgot-password';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [domicileCountry, setDomicileCountry] = useState('United States');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() =>
    mode === 'signin' ? noticeFromParam(noticeParam) : null,
  );
  const [pending, setPending] = useState(false);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const waitForSession = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sessionResult = await authClient.getSession();
      if (sessionResult?.data?.session?.token) {
        return true;
      }
      await sleep(200 * (attempt + 1));
    }
    return false;
  };

  useEffect(() => {
    if (mode !== 'signin') return;
    const nextNotice = noticeFromParam(noticeParam);
    if (nextNotice) {
      setNotice(nextNotice);
    }
  }, [mode, noticeParam]);

  useEffect(() => {
    if (mode !== 'signin') return;
    if (!prefillEmail) return;
    setEmail(prefillEmail);
  }, [mode, prefillEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const formData = new FormData(event.currentTarget);
    const formEmail = (formData.get('email') as string)?.trim();
    const formPassword = (formData.get('password') as string) ?? '';
    const formName = (formData.get('name') as string) ?? '';
    const formTeamName = (formData.get('teamName') as string) ?? '';
    const formTaxId = (formData.get('taxId') as string) ?? '';
    const formDomicileCountry = (formData.get('domicileCountry') as string) ?? '';

    if (!formEmail || !formPassword) {
      setError('Email and password are required.');
      setPending(false);
      return;
    }

    try {
      const authResult =
        mode === 'signin'
          ? await authClient.signIn.email({
              email: formEmail,
              password: formPassword,
              fetchOptions: { cache: 'no-store' },
            })
          : await authClient.signUp.email({
              email: formEmail,
              password: formPassword,
              name: formName,
              callbackURL: (() => {
                const callbackQuery = new URLSearchParams();
                callbackQuery.set('notice', 'account-created');
                callbackQuery.set('email', formEmail);
                return `/sign-in${callbackQuery.toString() ? `?${callbackQuery.toString()}` : ''}`;
              })(),
              fetchOptions: { cache: 'no-store' },
            });

      if (authResult.error) {
        const message = authResult.error?.message ?? 'Authentication failed.';
        setError(message);
        return;
      }

      const authData = authResult.data;
      const hasSession = Boolean(authData?.token);

      if (mode === 'signup' && !hasSession) {
        const signInQuery = new URLSearchParams();
        signInQuery.set('notice', 'account-created');
        signInQuery.set('email', formEmail);
        window.location.replace(
          `/sign-in${signInQuery.toString() ? `?${signInQuery.toString()}` : ''}`,
        );
        return;
      }

      if (!hasSession) {
        setError('Authentication did not create a session. Please try again.');
        return;
      }

      // Create/sync legacy records so the dashboard can load.
      const syncPayload = JSON.stringify({
        teamName: formTeamName.trim() || null,
        taxId: formTaxId.trim() || null,
        domicileCountry: formDomicileCountry.trim() || null,
      });
      const syncRequest: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: syncPayload,
        credentials: 'include',
      };
      let syncResponse = await fetch('/api/auth/post-signup', syncRequest);
      if (syncResponse.status === 401) {
        const sessionReady = await waitForSession();
        if (!sessionReady) {
          setError('We could not confirm your session yet. Please refresh and sign in again.');
          return;
        }
        syncResponse = await fetch('/api/auth/post-signup', syncRequest);
      }
      const syncBody = (await syncResponse.json().catch(() => ({}))) as {
        error?: unknown;
        userId?: number;
        teamId?: number;
        createdUser?: boolean;
      };
      if (!syncResponse.ok || syncBody.error) {
        setError(typeof syncBody.error === 'string' ? syncBody.error : 'Could not finish signup.');
        return;
      }

      window.location.replace('/dashboard/reports/balance-sheet');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Flowybooks
          </Link>
        </div>

        {/* Auth Card */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {mode === 'signin' ? 'Sign in' : 'Create an account'}
            </CardTitle>
            <CardDescription>
              {mode === 'signin'
                ? 'Enter your email below to sign in.'
                : 'Enter your details below to create your local workspace.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email/Password Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={50}
                  placeholder="Email address"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'signin' && (
                    <Link
                      href={forgotPasswordHref}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={100}
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="Your name"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="teamName">Organization name</Label>
                  <Input
                    id="teamName"
                    name="teamName"
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                    placeholder="Your company or organization"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Tax ID (optional)</Label>
                    <Input
                      id="taxId"
                      name="taxId"
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      maxLength={64}
                      placeholder="EIN / VAT / GST"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domicileCountry">Country (optional)</Label>
                    <select
                      id="domicileCountry"
                      name="domicileCountry"
                      value={domicileCountry}
                      onChange={(e) => setDomicileCountry(e.target.value)}
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
              )}

              {error && <div className="text-sm text-destructive">{error}</div>}
              {notice && <div className="text-sm text-muted-foreground">{notice}</div>}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : mode === 'signin' ? (
                  'Sign in'
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              {mode === 'signin' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <Link
                    href={switchAuthHref}
                    className="font-medium text-foreground hover:underline"
                  >
                    Sign up
                  </Link>
                </>
              ) : mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <Link
                    href={switchAuthHref}
                    className="font-medium text-foreground hover:underline"
                  >
                    Sign in
                  </Link>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
