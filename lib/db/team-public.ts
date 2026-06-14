import type { OrganizationDataWithMembers } from '@/lib/db/schema';

export type PublicTeamMember = Omit<
  OrganizationDataWithMembers['members'][number],
  'teamId' | 'userId'
>;

export type PublicTeam = Omit<OrganizationDataWithMembers, 'id' | 'members'> & {
  members: PublicTeamMember[];
};

export function toPublicTeam(team: OrganizationDataWithMembers): PublicTeam {
  const publicTeam = {
    ...team,
    members: team.members.map(({ teamId: _teamId, userId: _userId, ...member }) => member),
  };
  delete (publicTeam as { id?: unknown }).id;
  return publicTeam;
}
