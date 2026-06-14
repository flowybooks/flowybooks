'use client';

import { useActionState, useRef, useMemo, useState, type FocusEvent } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  CLASSIFICATION_TO_TYPE,
  type CoaClassification,
  type CoaType,
} from '@/lib/accounting/accounts-import';
import { createAccountAction, updateAccountAction, type AccountActionState } from './actions';

const initialState: AccountActionState = {};

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification | null;
  isActive: boolean;
  isStatementAccount: boolean;
};

const DEFAULT_CLASSIFICATION_BY_TYPE: Record<CoaType, CoaClassification> = {
  asset: 'current_asset',
  liability: 'current_liability',
  equity: 'equity',
  income: 'sales',
  expense: 'operating_expense',
};

function formatClassificationLabel(classification: string): string {
  return classification
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function CreateAccountForm() {
  const [state, formAction, isPending] = useActionState(createAccountAction, initialState);
  const [selectedType, setSelectedType] = useState<CoaType | ''>('');
  const [selectedClassification, setSelectedClassification] = useState<CoaClassification | ''>('');

  const classificationOptions = useMemo(() => {
    if (!selectedType) return [];
    return (Object.keys(CLASSIFICATION_TO_TYPE) as CoaClassification[]).filter(
      (classification) => CLASSIFICATION_TO_TYPE[classification] === selectedType,
    );
  }, [selectedType]);

  return (
    <div className="space-y-2">
      <form action={formAction} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Code</label>
          <input
            name="code"
            required
            maxLength={5}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Name</label>
          <input name="name" required className="w-full rounded border px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            name="type"
            required
            className="w-full rounded border px-2 py-1 text-sm bg-background"
            value={selectedType}
            onChange={(event) => {
              const nextType = event.target.value as CoaType;
              setSelectedType(nextType);
              setSelectedClassification(DEFAULT_CLASSIFICATION_BY_TYPE[nextType] ?? '');
            }}
          >
            <option value="" disabled>
              Select type...
            </option>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Classification</label>
          <select
            name="classification"
            required
            disabled={!selectedType}
            className="w-full rounded border px-2 py-1 text-sm bg-background disabled:opacity-50"
            value={selectedClassification}
            onChange={(event) => {
              setSelectedClassification(event.target.value as CoaClassification);
            }}
          >
            {!selectedType ? (
              <option value="" disabled>
                Select type first...
              </option>
            ) : null}
            {classificationOptions.map((classification) => (
              <option key={classification} value={classification}>
                {formatClassificationLabel(classification)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isStatementAccount" />
            <span>Statement account</span>
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="mt-1 inline-flex items-center justify-center rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Adding...' : 'Add Account'}
          </button>
        </div>
      </form>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}

export function AccountRowEditor({
  account,
  classificationLabel,
}: {
  account: AccountRow;
  classificationLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(updateAccountAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `account-row-${account.id}`;

  const submitForm = () => {
    if (isPending) return;
    formRef.current?.requestSubmit();
  };

  const handleNameBlur = (event: FocusEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value.trim();
    const initialValue = event.currentTarget.dataset.initial ?? '';
    if (value === '') {
      return;
    }
    if (value !== initialValue) {
      submitForm();
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-xs">{account.code}</TableCell>
      <TableCell className="text-sm">
        <span className="hidden" data-print-only>
          {account.name ?? ''}
        </span>
        <input
          form={formId}
          name="name"
          defaultValue={account.name ?? ''}
          data-initial={account.name ?? ''}
          onBlur={handleNameBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitForm();
            }
          }}
          required
          disabled={isPending}
          className="w-full max-w-[220px] rounded border px-2 py-1 text-sm"
          data-print-hidden
        />
      </TableCell>
      <TableCell className="capitalize text-xs text-muted-foreground">{account.type}</TableCell>
      <TableCell
        className="hidden sm:table-cell text-xs text-muted-foreground"
        data-print-table-cell
      >
        {classificationLabel}
      </TableCell>
      <TableCell className="text-left" data-print-hidden>
        <form
          ref={formRef}
          id={formId}
          action={formAction}
          className="flex items-center justify-start gap-2 text-xs"
        >
          <input type="hidden" name="accountId" value={account.id} />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={account.isActive}
              onChange={submitForm}
              disabled={isPending}
            />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              name="isStatementAccount"
              defaultChecked={account.isStatementAccount}
              onChange={submitForm}
              disabled={isPending}
            />
            <span>Statement</span>
          </label>
          <button type="submit" className="sr-only">
            Save
          </button>
          {isPending ? <span className="text-[10px] text-muted-foreground">Saving...</span> : null}
        </form>
        {state.error ? (
          <p className="text-xs text-red-600 text-right max-w-[220px]">{state.error}</p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
