'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type OrgSummary = {
  id: number;
  name: string;
  publicId: string | null;
  role: string;
};

type OrgListResponse = {
  currentOrgId: number | null;
  orgs: OrgSummary[];
};

export function OrgSwitcher() {
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<OrgListResponse>('/api/orgs', fetcher);
  const [pendingOrgId, setPendingOrgId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const currentOrg = useMemo(() => {
    if (!data?.orgs?.length) return null;
    const match = data.orgs.find((org) => org.id === data.currentOrgId);
    return match ?? data.orgs[0];
  }, [data]);

  const handleSwitch = async (orgId: number) => {
    if (!data || orgId === data.currentOrgId) return;
    setError(null);
    setPendingOrgId(orgId);
    try {
      const response = await fetch('/api/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to switch organizations.');
      }

      await mutate();
      router.refresh();
    } catch (switchError) {
      const message =
        switchError instanceof Error ? switchError.message : 'Unable to switch organizations.';
      setError(message);
    } finally {
      setPendingOrgId(null);
    }
  };

  const handleCreate = async () => {
    const trimmed = orgName.trim();
    if (!trimmed) {
      setCreateError('Organization name is required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const response = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to create organization.');
      }

      setOrgName('');
      setCreateOpen(false);
      await mutate();
      router.refresh();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : 'Unable to create organization.';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={createOpen} onOpenChange={setCreateOpen}>
      <div className="space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between rounded-md border border-sidebar-border/60 px-2 text-left text-sm font-medium"
              disabled={isLoading}
            >
              <span className="truncate">
                {currentOrg?.name || (isLoading ? 'Loading...' : 'Select organization')}
              </span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {data?.orgs?.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onSelect={() => handleSwitch(org.id)}
                disabled={pendingOrgId !== null}
                className="gap-2"
              >
                <span className="truncate">{org.name}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {org.role}
                </span>
                {org.id === data.currentOrgId ? (
                  <Check className="h-3 w-3 text-muted-foreground" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
      </div>

      <SheetContent side="right" className="sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Create organization</SheetTitle>
          <SheetDescription>Add a new organization and switch to it immediately.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="org-name">
            Organization name
          </label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            placeholder="Example Organization"
            maxLength={100}
            className="mt-2"
          />
          {createError ? <p className="mt-2 text-xs text-red-500">{createError}</p> : null}
        </div>
        <SheetFooter>
          <Button
            type="button"
            onClick={handleCreate}
            className="w-full"
            disabled={isCreating || orgName.trim().length === 0}
          >
            {isCreating ? 'Creating...' : 'Create organization'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
