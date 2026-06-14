'use server';

import { revalidatePath } from 'next/cache';
import { requireTeamRole } from '@/lib/auth/middleware';
import { updateTeamProfile } from '@/lib/db/queries';

export type TeamProfileActionState = {
  error?: string;
  success?: string;
};

function normalizeOptionalValue(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateTeamProfileAction(
  _prevState: TeamProfileActionState,
  formData: FormData,
): Promise<TeamProfileActionState> {
  try {
    const { team } = await requireTeamRole('owner');
    const nameRaw =
      typeof formData.get('teamName') === 'string' ? String(formData.get('teamName')) : '';
    const name = nameRaw.trim();

    if (name.length < 2) {
      return { error: 'Organization name must be at least 2 characters.' };
    }
    if (name.length > 120) {
      return { error: 'Organization name must be 120 characters or less.' };
    }

    const taxId = normalizeOptionalValue(formData.get('taxId'), 64);
    const domicileCountry = normalizeOptionalValue(formData.get('domicileCountry'), 100);

    await updateTeamProfile(team.id, {
      name,
      taxId,
      domicileCountry,
    });

    revalidatePath('/dashboard');
    return { success: 'Organization updated.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to update organization.',
    };
  }
}
