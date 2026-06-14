import { NextResponse } from 'next/server';

import { isAuthorizationError, requireTeamRole, type TeamRole } from '@/lib/auth/middleware';

export type ApiTeamContext = Awaited<ReturnType<typeof requireTeamRole>>;

export const READ_TEAM_ROLES: TeamRole[] = ['owner', 'member', 'viewer', 'advisor', 'bookkeeper'];
export const WRITE_TEAM_ROLES: TeamRole[] = ['owner', 'member', 'advisor', 'bookkeeper'];

type ApiRouteHandler<TContext> = (
  auth: ApiTeamContext,
  request: Request,
  context: TContext,
) => Response | Promise<Response>;

export function apiError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

export function authorizationErrorResponse(error: unknown): Response | null {
  if (!isAuthorizationError(error)) {
    return null;
  }

  return apiError(error.status === 401 ? 'Unauthorized' : 'Forbidden', error.status);
}

export function withApiTeamRole<TContext>(
  allowed: TeamRole | TeamRole[],
  handler: ApiRouteHandler<TContext>,
) {
  return async function apiTeamRoute(request: Request, context: TContext): Promise<Response> {
    try {
      const auth = await requireTeamRole(allowed);
      return await handler(auth, request, context);
    } catch (error) {
      const authResponse = authorizationErrorResponse(error);
      if (authResponse) {
        return authResponse;
      }
      throw error;
    }
  };
}
