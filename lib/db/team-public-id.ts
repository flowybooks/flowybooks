import { randomInt } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { organizations } from '@/lib/db/schema';

const PUBLIC_ID_DIGITS = '23456789';
const PUBLIC_ID_LENGTH = 5;
const MAX_ATTEMPTS = 20;

export function generateTeamPublicId(): string {
  let value = '';
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    value += PUBLIC_ID_DIGITS[randomInt(0, PUBLIC_ID_DIGITS.length)];
  }
  return value;
}

export async function generateUniqueTeamPublicId(
  maxAttempts: number = MAX_ATTEMPTS,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateTeamPublicId();
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.publicId, candidate))
      .limit(1);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique team ID. Please try again.');
}
