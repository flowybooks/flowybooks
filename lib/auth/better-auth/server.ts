import { betterAuth } from 'better-auth';
import { buildBetterAuthConfig } from './config';

type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuth>>;

let cachedAuth: BetterAuthInstance | null = null;

export async function createBetterAuth() {
  return betterAuth(buildBetterAuthConfig());
}

export async function getBetterAuth() {
  if (cachedAuth) return cachedAuth;
  cachedAuth = await createBetterAuth();
  return cachedAuth;
}
