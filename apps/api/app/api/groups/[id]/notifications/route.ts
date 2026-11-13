import {
  crewAlertEnabledForUser,
  getCrewNotificationPrefs,
  getGroupForMember,
  setCrewNotificationPrefs,
} from "@repin/db";
import {
  crewNotificationPrefsSchema,
  groupIdSchema,
  notificationSummary,
} from "@repin/validation";
import { NextResponse } from "next/server";

import { handleCrewMutationError } from "../../../../../lib/crew-route";
import { requireApplicationUser, requireAuthenticatedUser } from "../../../../../lib/supabase-auth";

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

    const group = await getGroupForMember({
      groupId: groupId.data,
      userId: user.id,
    });
    if (!group) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const prefs = await getCrewNotificationPrefs({
      userId: user.id,
      groupId: groupId.data,
    });
    const url = new URL(request.url);
    const alertType = url.searchParams.get("alertType");
    if (
      alertType === "crew_workout"
      || alertType === "crew_comment"
      || alertType === "crew_reaction"
      || alertType === "crew_post"
    ) {
      const enabled = await crewAlertEnabledForUser({
        userId: user.id,
        groupId: groupId.data,
        alertType,
      });
      return NextResponse.json(
        { enabled, notifications: { ...prefs, summary: notificationSummary(prefs) } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { notifications: { ...prefs, summary: notificationSummary(prefs) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Notification prefs could not be loaded");
  }
}

export async function PUT(
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

    const group = await getGroupForMember({
      groupId: groupId.data,
      userId: user.id,
    });
    if (!group) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const input = crewNotificationPrefsSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ error: "Notification prefs are invalid" }, { status: 400 });
    }

    const prefs = await setCrewNotificationPrefs({
      userId: user.id,
      groupId: groupId.data,
      prefs: input.data,
    });

    return NextResponse.json(
      { notifications: { ...prefs, summary: notificationSummary(prefs) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleCrewMutationError(error, "Notification prefs could not be saved");
  }
}
