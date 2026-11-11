import {
  getCrewNotificationPrefs,
  getGroupForMember,
  listCrewMembers,
  updateCrewForOwner,
} from "@repin/db";
import { getUserInitials } from "@repin/types";
import {
  crewPageQuerySchema,
  crewSundayWeekBounds,
  groupIdSchema,
  isCrewPhotoPathForGroup,
  notificationSummary,
  updateCrewSchema,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { deleteStoredCrewPhoto, signCrewPhotoUrl } from "../../../../lib/crew-photos";
import { handleCrewMutationError } from "../../../../lib/crew-route";
import { reportUnexpectedRouteError } from "../../../../lib/sentry";
import {
  AuthenticationError,
  requireApplicationUser,
  requireAuthenticatedUser,
} from "../../../../lib/supabase-auth";
import { withResolvedDisplayName } from "../../../../lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const groupId = groupIdSchema.safeParse(id);

    if (!groupId.success) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const query = crewPageQuerySchema.safeParse({
      timeZone: url.searchParams.get("timeZone") ?? undefined,
      timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Invalid crew request" }, { status: 400 });
    }

    const group = await getGroupForMember({
      groupId: groupId.data,
      userId: user.id,
    });

    if (!group) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const { weekStart, weekEnd } = crewSundayWeekBounds(new Date(), query.data);
    const [members, notifications, photoUrl] = await Promise.all([
      listCrewMembers({
        groupId: group.id,
        viewerUserId: user.id,
        weekStart,
        weekEnd,
      }),
      getCrewNotificationPrefs({ userId: user.id, groupId: group.id }),
      signCrewPhotoUrl(group.photoPath).catch((error) => {
        console.error("Crew photo URL could not be signed", error);
        return null;
      }),
    ]);

    return NextResponse.json(
      {
        group: {
          id: group.id,
          name: group.name,
          ownerId: group.ownerId,
          createdAt: group.createdAt.toISOString(),
          role: group.role,
          inviteCode: group.inviteCode,
          photoPath: group.photoPath,
          photoUrl,
          memberCount: members.length,
        },
        members: members.map((member) => {
          const named = withResolvedDisplayName(member);
          return {
            userId: named.userId,
            displayName: named.displayName,
            role: named.role,
            isYou: named.userId === user.id,
            workoutsThisWeek: named.workoutsThisWeek,
            initials: getUserInitials({ displayName: named.displayName }),
          };
        }),
        notifications: {
          ...notifications,
          summary: notificationSummary(notifications),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    reportUnexpectedRouteError("Crew could not be loaded", error);
    return NextResponse.json(
      { error: "Crew could not be loaded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApplicationUser(request);
    const { id } = await context.params;
    const groupId = groupIdSchema.safeParse(id);
    if (!groupId.success) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const body: unknown = await request.json().catch(() => null);
    const input = updateCrewSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ error: "Crew updates are invalid" }, { status: 400 });
    }

    if (
      input.data.photoPath
      && !isCrewPhotoPathForGroup(input.data.photoPath, groupId.data)
    ) {
      return NextResponse.json({ error: "Crew photo path is invalid" }, { status: 400 });
    }

    const existing = await getGroupForMember({
      groupId: groupId.data,
      userId: user.id,
    });
    if (!existing) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const updated = await updateCrewForOwner({
      userId: user.id,
      groupId: groupId.data,
      name: input.data.name,
      photoPath: input.data.photoPath,
    });
    if (!updated) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    if (
      input.data.photoPath !== undefined
      && existing.photoPath
      && existing.photoPath !== input.data.photoPath
    ) {
      await deleteStoredCrewPhoto(existing.photoPath, groupId.data).catch((error) => {
        console.error("Previous crew photo could not be deleted", error);
      });
    }

    return NextResponse.json(
      { group: updated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Crew could not be updated");
  }
}
