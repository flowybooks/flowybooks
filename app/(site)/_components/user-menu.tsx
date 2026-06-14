import { getUser } from '@/lib/db/queries';
import { UserMenuClient } from './user-menu-client';

export async function UserMenu() {
  const user = await getUser();
  return <UserMenuClient user={user} />;
}
