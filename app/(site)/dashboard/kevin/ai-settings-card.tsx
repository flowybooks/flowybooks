'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { KevinModelTier, KevinRuntimeStatus } from '@/lib/kevin/types';

const MODEL_TIERS: KevinModelTier[] = ['small', 'medium', 'large'];

function modelSummary(status: KevinRuntimeStatus, tier: KevinModelTier) {
  if (!status.configured) return 'Not configured';
  const providerLabel = status.provider === 'ollama' ? 'Local' : 'OpenAI';
  return `${providerLabel}: ${status.models[tier] ?? 'unknown model'}`;
}

export function AiSettingsCard({
  status,
  selectedModelTier,
  onSelectModelTier,
}: {
  status: KevinRuntimeStatus;
  selectedModelTier: KevinModelTier;
  onSelectModelTier: (tier: KevinModelTier) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Settings</CardTitle>
        <CardDescription>{modelSummary(status, selectedModelTier)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.configured ? (
          <>
            {status.isHosted ? (
              <div className="flex items-start gap-2 border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4" />
                <span>Hosted mode may send selected accounting context to your provider.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 size-4" />
                <span>Local Ollama mode is active.</span>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Model tier</div>
              <div className="grid grid-cols-3 gap-1 rounded-md border bg-background p-1">
                {MODEL_TIERS.map((tier) => {
                  const selected = selectedModelTier === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => onSelectModelTier(tier)}
                      className={`min-w-0 rounded px-2 py-1.5 text-xs font-medium capitalize transition ${
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      aria-pressed={selected}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Small is fastest. Large is slower and best reserved for hard reasoning.
              </p>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Small</dt>
                <dd className="font-mono">{status.models.small}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Medium</dt>
                <dd className="font-mono">{status.models.medium}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Large</dt>
                <dd className="font-mono">{status.models.large}</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="space-y-3 text-muted-foreground">
            <p>{status.setupMessage}</p>
            <pre className="overflow-x-auto bg-muted p-3 text-xs text-foreground">
              AI_PROVIDER=ollama{'\n'}OLLAMA_BASE_URL=http://localhost:11434/v1
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
