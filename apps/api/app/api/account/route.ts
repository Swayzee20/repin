import { deleteUserAccount } from "@repin/db";
import { NextResponse } from "next/server";

import { deleteAuthUser, deleteUserWorkoutPhotos } from "../../../lib/account-deletion";
import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const identity = await requireAuthenticatedUser(request);
    // Photos first, application rows second, and the auth user last. Listing
    // storage and deleting rows are safe to repeat, and the caller can still
    // sign in to retry until the auth user is gone. Removing auth first would
    // strand any rows left behind a failed database delete.
    await deleteUserWorkoutPhotos(identity.id);
    await deleteUserAccount(identity.id);
    await deleteAuthUser(identity.id);

    return NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Account could not be deleted", error);
    return NextResponse.json(
      { error: "Account could not be deleted" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
