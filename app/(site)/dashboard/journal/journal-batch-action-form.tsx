'use client';

// This client component renders journal action buttons that call server actions.
// It keeps the post/delete form wiring out of the page files so those pages stay
// simpler and Next can register the actions reliably.

import { useFormStatus } from 'react-dom';
import { deleteJournalFromForm, postJournalFromForm, voidJournalFromForm } from './actions';

type JournalBatchActionKind = 'post-draft' | 'delete-draft' | 'void-posted';

type JournalBatchActionFormProps = {
  kind: JournalBatchActionKind;
  batchId: string;
  label: string;
  pendingLabel: string;
  buttonClassName: string;
  formClassName?: string;
};

const actionByKind = {
  'post-draft': postJournalFromForm,
  'delete-draft': deleteJournalFromForm,
  'void-posted': voidJournalFromForm,
} as const;

function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function JournalBatchActionForm({
  kind,
  batchId,
  label,
  pendingLabel,
  buttonClassName,
  formClassName,
}: JournalBatchActionFormProps) {
  const action = actionByKind[kind];

  return (
    <form action={action} className={formClassName}>
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton label={label} pendingLabel={pendingLabel} className={buttonClassName} />
    </form>
  );
}
