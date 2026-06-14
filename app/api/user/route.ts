export const dynamic = 'force-dynamic';

import { getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'User is not authenticated' }, { status: 401 });
  }
  return Response.json(user);
}
