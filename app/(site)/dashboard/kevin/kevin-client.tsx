'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bot, Paperclip, Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  KevinActionResult,
  KevinAskResult,
  KevinJournalProposal,
  KevinModelTier,
  KevinResponse,
  KevinRuntimeStatus,
  KevinThreadSnapshot,
} from '@/lib/kevin/types';
import { ActionHistoryCard } from './action-history-card';
import { AiSettingsCard } from './ai-settings-card';
import { ProposalPreview } from './proposal-preview';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: KevinResponse | undefined;
  action?: KevinActionResult | null | undefined;
};

type KevinClientProps = {
  initialStatus: KevinRuntimeStatus;
  initialActions: KevinActionResult[];
  initialThread: KevinThreadSnapshot;
};

type StatementImportUploadResponse = {
  error?: unknown;
  importId?: unknown;
  fileName?: unknown;
  message?: unknown;
  askResult?: KevinAskResult;
};

const ATTACHMENT_ACCEPT = '.pdf,.csv,application/pdf,text/csv';

export function KevinClient({ initialStatus, initialActions, initialThread }: KevinClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [actions, setActions] = useState(initialActions);
  const [threadId, setThreadId] = useState<string | null>(initialThread.threadId);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialThread.messages);
  const [selectedModelTier, setSelectedModelTier] = useState<KevinModelTier>('medium');
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isWorking = busy || uploadPhase !== 'idle';

  async function refreshStatus() {
    const response = await fetch('/api/kevin/status');
    if (!response.ok) return;
    const body = (await response.json()) as {
      status: KevinRuntimeStatus;
      actions: KevinActionResult[];
    };
    setStatus(body.status);
    setActions(body.actions);
  }

  async function sendTextMessage(trimmed: string) {
    if (!trimmed || isWorking) return;

    setBusy(true);
    setError(null);
    setUploadError(null);
    setMessage('');
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: trimmed },
    ]);

    try {
      const response = await fetch('/api/kevin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, threadId, modelTier: selectedModelTier }),
      });
      const body = (await response.json()) as KevinAskResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in body && body.error ? body.error : 'Kevin failed to answer');
      }

      const result = body as KevinAskResult;
      setThreadId(result.threadId);
      setMessages((current) => [
        ...current,
        {
          id: result.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content: result.response.answer,
          response: result.response,
          action: result.action,
        },
      ]);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kevin failed to answer');
    } finally {
      setBusy(false);
    }
  }

  function fileKey(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  function attachFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length === 0) return;

    setUploadError(null);
    setAttachedFiles((current) => {
      const seen = new Set(current.map(fileKey));
      const merged = [...current];
      for (const file of nextFiles) {
        const key = fileKey(file);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
    event.target.value = '';
  }

  function removeAttachedFile(index: number) {
    setAttachedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function createJournal(proposal: KevinJournalProposal, journalStatus: 'draft' | 'posted') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/kevin/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, proposal, status: journalStatus }),
      });
      const body = (await response.json()) as KevinActionResult | { error?: string };
      if (!response.ok || 'error' in body) {
        throw new Error('error' in body ? body.error : 'Unable to create journal');
      }
      const action = body as KevinActionResult;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            journalStatus === 'posted'
              ? 'I posted the confirmed journal entry.'
              : 'I created a draft journal entry.',
          action,
        },
      ]);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create journal');
    } finally {
      setBusy(false);
    }
  }

  function generateBatchId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function uploadAttachedFiles(files: File[], instructions: string) {
    if (files.length === 0) {
      setUploadError('Choose at least one statement file.');
      return;
    }

    setUploadPhase('uploading');
    setError(null);
    setUploadError(null);
    const importBatchId = generateBatchId();
    const importedNames: string[] = [];
    const assistantMessages: ChatMessage[] = [];
    const trimmedInstructions = instructions.trim();
    let activeThreadId = threadId;

    try {
      for (const file of files) {
        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('importBatchId', importBatchId);
        uploadData.append('instructions', trimmedInstructions);
        uploadData.append('modelTier', selectedModelTier);
        if (activeThreadId) {
          uploadData.append('threadId', activeThreadId);
        }

        const response = await fetch('/api/kevin/statements', {
          method: 'POST',
          body: uploadData,
        });
        const body = (await response
          .json()
          .catch(() => null)) as StatementImportUploadResponse | null;

        if (!response.ok) {
          throw new Error(
            body && typeof body.error === 'string' ? body.error : `Upload failed for ${file.name}`,
          );
        }

        importedNames.push(body && typeof body.fileName === 'string' ? body.fileName : file.name);

        if (body?.askResult?.threadId) {
          activeThreadId = body.askResult.threadId;
          setThreadId(body.askResult.threadId);
        }

        assistantMessages.push({
          id: body?.askResult?.messageId ?? crypto.randomUUID(),
          role: 'assistant',
          content:
            body && typeof body.message === 'string'
              ? body.message
              : `Uploaded ${file.name}. Kevin classified the statement and is waiting for your next instruction.`,
          response: body?.askResult?.response,
          action: body?.askResult?.action ?? null,
        });
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content: trimmedInstructions
            ? `Attached ${importedNames.join(', ')} with instructions: ${trimmedInstructions}`
            : `Attached ${importedNames.join(', ')}`,
        },
        ...assistantMessages,
      ]);
      setMessage('');
      setAttachedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload statement files');
    } finally {
      setUploadPhase('idle');
    }
  }

  async function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();

    if (attachedFiles.length > 0) {
      await uploadAttachedFiles(attachedFiles, trimmed);
      return;
    }

    await sendTextMessage(trimmed);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-medium lg:text-2xl">
            <Bot className="size-5" />
            Kevin
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Local-first accounting help for basic journal proposals, ledger questions, source-gated
            answer labels, and auditable actions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ask Kevin</CardTitle>
            <CardDescription>
              Kevin can explain, propose, draft, and post after explicit confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <div className="border border-dashed border-border/70 bg-muted/20 p-6 text-sm leading-6 text-muted-foreground">
                Try: “Draft a journal to accrue a $250 utility bill to utilities payable on
                2026-06-30” or “Apply the standard chart of accounts.” For tax or GAAP questions,
                include allowed official authority URLs; Kevin should block authoritative
                conclusions when the source gate is not satisfied.
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={
                      item.role === 'user'
                        ? 'ml-auto max-w-[85%] bg-primary px-4 py-3 text-sm text-primary-foreground'
                        : 'max-w-[92%] border border-border/70 bg-background px-4 py-3 text-sm'
                    }
                  >
                    <div className="whitespace-pre-wrap leading-6">{item.content}</div>
                    {item.response || item.action?.journalBatchId ? (
                      <div className="mt-3 space-y-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                        {item.response ? (
                          <div className="flex flex-wrap gap-2">
                            <span>type: {item.response.answerLabel.answer_type}</span>
                            <span>authority: {item.response.answerLabel.authority_level}</span>
                            {item.response.answerLabel.cannot_answer_from_allowlist ? (
                              <span className="text-destructive">
                                source gate blocked conclusion
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {item.response && item.response.citations.length > 0 ? (
                          <div className="space-y-1">
                            {item.response.citations.map((citation) => (
                              <a
                                key={citation}
                                href={citation}
                                className="block break-all underline-offset-4 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {citation}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {item.response?.journalProposal ? (
                          <ProposalPreview
                            proposal={item.response.journalProposal}
                            busy={isWorking}
                            onCreate={(journalStatus) =>
                              createJournal(item.response!.journalProposal!, journalStatus)
                            }
                          />
                        ) : null}
                        {item.action?.journalBatchId ? (
                          <Link
                            href={`/dashboard/journal/${item.action.journalBatchId}`}
                            className="inline-flex text-foreground underline-offset-4 hover:underline"
                          >
                            Open created journal
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {error ? (
              <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4" />
                <span>{error}</span>
              </div>
            ) : null}

            <form className="space-y-3" onSubmit={submitComposer}>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={isWorking}
                className="min-h-28 w-full resize-y border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                placeholder="Ask Kevin about a journal, reconciliation, uploaded document, or known ledger data..."
              />

              {attachedFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={fileKey(file)}
                      className="inline-flex max-w-full items-center gap-2 border border-border/70 bg-muted/30 px-3 py-1.5 text-xs"
                    >
                      <span className="max-w-[16rem] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachedFile(index)}
                        disabled={isWorking}
                        className="text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                        aria-label={`Remove ${file.name}`}
                        title={`Remove ${file.name}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {uploadError ? (
                <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4" />
                  <span>{uploadError}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  multiple
                  disabled={isWorking}
                  onChange={attachFiles}
                  className="sr-only"
                  tabIndex={-1}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={isWorking}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach PDF or CSV"
                  title="Attach PDF or CSV"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={isWorking || (!message.trim() && attachedFiles.length === 0)}
                >
                  <Send className="size-4" />
                  {isWorking ? 'Working' : 'Ask Kevin'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <AiSettingsCard
          status={status}
          selectedModelTier={selectedModelTier}
          onSelectModelTier={setSelectedModelTier}
        />
        <ActionHistoryCard actions={actions} />
      </aside>
    </div>
  );
}
