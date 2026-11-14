import {
  deleteUserAccount,
  listAccountDeletionStoragePlan,
  listNewOwnerHandoverTargets,
} from "@repin/db";
import { NextResponse } from "next/server";

import {
  deleteAuthUser,
  deleteClosedCrewStorage,
  deleteUserWorkoutPhotos,
} from "../../../lib/account-deletion";
import { scheduleCrewPush, notifyCrewOwnerHandover } from "../../../lib/crew-push";
import { PasswordReauthError, readDeletePassword, runAccountDeletion } from "../../../lib/delete-account";
import { passwordReauthStatus } from "../../../lib/password-reauth";
import { reportUnexpectedRouteError } from "../../../lib/sentry";
import {
  AuthenticationError,
  getSupabaseAuthClient,
  requireAuthenticatedUser,
} from "../../../lib/supabase-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const identity = await requireAuthenticatedUser(request);
    const body: unknown = await request.json().catch(() => null);
    const password = readDeletePassword(body);

    await runAccountDeletion({
      userId: identity.id,
      email: identity.email,
      amr: identity.amr,
      password,
      verifyPassword: async (email, value) => {
        const { error } = await getSupabaseAuthClient().auth.signInWithPassword({
          email,
          password: value,
        });
        return !error;
      },
      prepareStorage: listAccountDeletionStoragePlan,
      deleteUserPhotos: deleteUserWorkoutPhotos,
      deleteAccount: deleteUserAccount,
      deleteClosedCrewStorage,
      notifyNewOwners: async (transfers) => {
        const targets = await listNewOwnerHandoverTargets(transfers);
        scheduleCrewPush(() => notifyCrewOwnerHandover(targets));
      },
      deleteAuthUser,
    });

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
    if (error instanceof PasswordReauthError) {
      const result = passwordReauthStatus(error);
      return NextResponse.json(result.body, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    reportUnexpectedRouteError("Account could not be deleted", error);
    return NextResponse.json(
      { error: "Account could not be deleted" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
