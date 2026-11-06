import { and, eq, isNull, sql, type AnyColumn } from "drizzle-orm";

import * as schema from "./schema";

export const activeMembership = isNull(schema.groupMembers.leftAt);
export const openGroup = isNull(schema.groups.closedAt);

export function viewerActiveMembership(userId: string) {
  return and(eq(schema.groupMembers.userId, userId), activeMembership);
}

function asGroupId(groupId: AnyColumn | string) {
  return typeof groupId === "string" ? sql`${groupId}::uuid` : groupId;
}

export function crewAuthorVisibleSql(
  groupId: AnyColumn | string,
  authorIdColumn: AnyColumn,
  createdAtColumn: AnyColumn,
) {
  const groupIdSql = asGroupId(groupId);
  return sql`exists (
    select 1
    from ${schema.groupMembers} as visible_author
    where visible_author.group_id = ${groupIdSql}
      and visible_author.user_id = ${authorIdColumn}
      and visible_author.left_at is null
      and ${createdAtColumn} >= visible_author.content_visible_after
  )`;
}

export function commentAuthorVisibleSql(groupId: AnyColumn | string) {
  const groupIdSql = asGroupId(groupId);
  return sql`exists (
    select 1
    from ${schema.groupMembers} as visible_commenter
    where visible_commenter.group_id = ${groupIdSql}
      and visible_commenter.user_id = ${schema.communityPostComments.userId}
      and visible_commenter.left_at is null
      and ${schema.communityPostComments.createdAt} >= visible_commenter.content_visible_after
  )`;
}

export function reactionAuthorVisibleSql(groupId: AnyColumn | string) {
  const groupIdSql = asGroupId(groupId);
  return sql`exists (
    select 1
    from ${schema.groupMembers} as visible_reactor
    where visible_reactor.group_id = ${groupIdSql}
      and visible_reactor.user_id = ${schema.communityPostReactions.userId}
      and visible_reactor.left_at is null
      and ${schema.communityPostReactions.createdAt} >= visible_reactor.content_visible_after
  )`;
}
