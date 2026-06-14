'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { KevinActionResult } from '@/lib/kevin/types';

export function ActionHistoryCard({ actions }: { actions: KevinActionResult[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Action History</CardTitle>
        <CardDescription>Auditable Kevin-created actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild type="button" size="sm" variant="outline" className="w-full">
          <Link href="/dashboard/time-machine">Open Time Machine</Link>
        </Button>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Kevin actions yet.</p>
        ) : (
          actions.map((action) => (
            <div key={action.actionId} className="border border-border/70 p-3 text-sm">
              <div className="font-medium">{action.actionType.replace(/_/g, ' ')}</div>
              <div className="text-xs text-muted-foreground">status: {action.status}</div>
              {action.journalBatchId ? (
                <Link
                  href={`/dashboard/journal/${action.journalBatchId}`}
                  className="mt-1 block text-xs underline-offset-4 hover:underline"
                >
                  Open journal
                </Link>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
