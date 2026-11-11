import "server-only";

import { sql, type AnyColumn, type SQL } from "drizzle-orm";

import { getDatabase } from "./connection";
import * as schema from "./schema";

function asUuid(value: AnyColumn | SQL | string) {
  return typeof value === "string" ? sql`${value}::uuid` : value;
}

/** Canonical social-post predicate. Callers must not reimplement these checks. */
export function communityPostVisibleToSql(
  viewerId: AnyColumn | SQL | string,
  postId: AnyColumn | SQL | string,
) {
  return sql`private.community_post_visible_to(${asUuid(viewerId)}, ${asUuid(postId)})`;
}

export function communityCommentVisibleToSql(
  viewerId: AnyColumn | SQL | string,
  commentId: AnyColumn | SQL | string,
) {
  return sql`private.community_comment_visible_to(${asUuid(viewerId)}, ${asUuid(commentId)})`;
}

export function communityReactionVisibleToSql(
  viewerId: AnyColumn | SQL | string,
  reactionId: AnyColumn | SQL | string,
) {
  return sql`private.community_reaction_visible_to(${asUuid(viewerId)}, ${asUuid(reactionId)})`;
}

/** Owner history, or any currently visible share of this session. */
export function workoutSessionVisibleToSql(
  viewerId: string,
  sessionId: AnyColumn | SQL | string,
) {
  const sessionIdSql = asUuid(sessionId);
  return sql`(
    exists (
      select 1
      from ${schema.workoutSessions} as owned_session
      where owned_session.id = ${sessionIdSql}
        and owned_session.user_id = ${viewerId}::uuid
    )
    or exists (
      select 1
      from ${schema.communityPosts} as share
      where share.workout_session_id = ${sessionIdSql}
        and private.community_post_visible_to(${viewerId}::uuid, share.id)
    )
  )`;
}

/** Own definition, or a readable session owned by the definition creator. */
export function creatorAuthorizedDefinitionSql(
  viewerId: string,
  definitionId: AnyColumn | SQL | string,
) {
  const definitionIdSql = asUuid(definitionId);
  return sql`(
    exists (
      select 1
      from ${schema.workoutDefinitions} as owned_definition
      where owned_definition.id = ${definitionIdSql}
        and owned_definition.created_by_user_id = ${viewerId}::uuid
    )
    or exists (
      select 1
      from ${schema.workoutSessions} as session
      join ${schema.workoutDefinitions} as definition
        on definition.id = session.workout_definition_id
      where definition.id = ${definitionIdSql}
        and session.user_id = definition.created_by_user_id
        and (
          session.user_id = ${viewerId}::uuid
          or exists (
            select 1
            from ${schema.communityPosts} as share
            where share.workout_session_id = session.id
              and private.community_post_visible_to(${viewerId}::uuid, share.id)
          )
        )
    )
  )`;
}

async function booleanFromSql(fragment: SQL) {
  const result = await getDatabase().execute(
    sql`select ${fragment} as visible`,
  );
  const rows = result.rows as Array<{ visible?: boolean | null }>;
  return rows[0]?.visible === true;
}

export async function communityPostVisibleTo(viewerId: string, postId: string) {
  return booleanFromSql(communityPostVisibleToSql(viewerId, postId));
}

export async function communityCommentVisibleTo(viewerId: string, commentId: string) {
  return booleanFromSql(communityCommentVisibleToSql(viewerId, commentId));
}

export async function communityReactionVisibleTo(viewerId: string, reactionId: string) {
  return booleanFromSql(communityReactionVisibleToSql(viewerId, reactionId));
}

export async function isWorkoutSessionVisibleTo(viewerId: string, sessionId: string) {
  return booleanFromSql(workoutSessionVisibleToSql(viewerId, sessionId));
}

export async function isCreatorAuthorizedDefinitionVisibleTo(
  viewerId: string,
  definitionId: string,
) {
  return booleanFromSql(creatorAuthorizedDefinitionSql(viewerId, definitionId));
}
