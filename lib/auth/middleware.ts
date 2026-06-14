import { z } from 'zod';
import { OrganizationDataWithMembers } from '@/lib/db/schema';
import { getTeamForUser, getUser, type SafeUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';

export type ActionState = {
  error?: string;
  success?: string;
  [key: string]: unknown;
};

export type TeamRole = 'owner' | 'member' | 'viewer' | 'advisor' | 'bookkeeper';

export type AuthorizationErrorCode = 'UNAUTHENTICATED' | 'NO_TEAM' | 'NO_MEMBERSHIP' | 'FORBIDDEN';

export class AuthorizationError extends Error {
  code: AuthorizationErrorCode;
  status: 401 | 403;

  constructor(code: AuthorizationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthorizationError';
    this.code = code;
    this.status = code === 'UNAUTHENTICATED' ? 401 : 403;
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
) => Promise<T>;

export function validatedAction<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>,
) {
  return async (prevState: ActionState, formData: FormData) => {
    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? 'Invalid input' };
    }

    return action(result.data, formData);
  };
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: SafeUser,
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>,
) {
  return async (prevState: ActionState, formData: FormData) => {
    const user = await getUser();
    if (!user) {
      throw new Error('User is not authenticated');
    }

    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? 'Invalid input' };
    }

    return action(result.data, formData, user);
  };
}

type ActionWithTeamFunction<T> = (
  formData: FormData,
  team: OrganizationDataWithMembers,
) => Promise<T>;

export function withTeam<T>(action: ActionWithTeamFunction<T>) {
  return async (formData: FormData): Promise<T> => {
    const user = await getUser();
    if (!user) {
      redirect('/sign-in');
    }

    const team = await getTeamForUser();
    if (!team) {
      throw new Error('Organization not found');
    }

    return action(formData, team);
  };
}

export async function requireTeamRole(allowed: TeamRole | TeamRole[]) {
  const user = await getUser();
  if (!user) {
    throw new AuthorizationError('UNAUTHENTICATED', 'User is not authenticated');
  }

  const team = await getTeamForUser();
  if (!team) {
    throw new AuthorizationError('NO_TEAM', 'Organization not found');
  }

  const membership = team.members.find((member) => member.user.id === user.id);
  if (!membership) {
    throw new AuthorizationError('NO_MEMBERSHIP', 'Membership not found');
  }

  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedRoles.includes(membership.role as TeamRole)) {
    throw new AuthorizationError('FORBIDDEN', 'Insufficient permissions');
  }

  return { user, team, role: membership.role as TeamRole };
}
