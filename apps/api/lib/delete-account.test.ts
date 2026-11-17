import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import { PasswordReauthError } from "./password-reauth";
import { runAccountDeletion } from "./delete-account";

const userId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const successorId = "33333333-3333-4333-8333-333333333333";

test("wrong or missing password stops deletion before storage work", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => runAccountDeletion({
      userId,
      email: "ada@example.com",
      amr: [],
      password: "wrong",
      verifyPassword: () => Promise.resolve(false),
      prepareStorage: () => {
        calls.push("prepare");
        return Promise.resolve({ protectedMediaPaths: [], closedCrewPhotoPaths: [], closedCrewIds: [] });
      },
      deleteUserPhotos: () => {
        calls.push("photos");
        return Promise.resolve();
      },
      deleteAccount: () => {
        calls.push("account");
        return Promise.resolve({ deletedUser: true, deletedGroupIds: [], transferredGroups: [] });
      },
      deleteClosedCrewStorage: () => {
        calls.push("closed");
        return Promise.resolve();
      },
      notifyNewOwners: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      deleteAuthUser: () => {
        calls.push("auth");
        return Promise.resolve();
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof PasswordReauthError);
      assert.equal(error.code, "wrong");
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test("deletion captures evidence, retains those photos, then deletes rows, closed storage, and auth", async () => {
  const calls: string[] = [];
  const retainSeen: string[][] = [];
  const result = await runAccountDeletion({
    userId,
    email: "ada@example.com",
    amr: [],
    password: "ok",
    verifyPassword: () => Promise.resolve(true),
    prepareStorage: () => {
      calls.push("prepare");
      return Promise.resolve({
        protectedMediaPaths: ["keep.jpg"],
        closedCrewPhotoPaths: ["crew/photo.jpg"],
        closedCrewIds: [groupId],
      });
    },
    deleteUserPhotos: (_id, retain) => {
      calls.push("photos");
      retainSeen.push([...retain]);
      return Promise.resolve();
    },
    deleteAccount: () => {
      calls.push("account");
      return Promise.resolve({
        deletedUser: true,
        deletedGroupIds: [groupId],
        transferredGroups: [{ groupId, newOwnerId: successorId }],
      });
    },
    deleteClosedCrewStorage: (groupIds, extraPaths, retain) => {
      calls.push("closed");
      assert.deepEqual(groupIds, [groupId]);
      assert.deepEqual(extraPaths, ["crew/photo.jpg"]);
      retainSeen.push([...retain]);
      return Promise.resolve();
    },
    notifyNewOwners: (transfers) => {
      calls.push("notify");
      assert.deepEqual(transfers, [{ groupId, newOwnerId: successorId }]);
      return Promise.resolve();
    },
    deleteAuthUser: () => {
      calls.push("auth");
      return Promise.resolve();
    },
  });
  assert.deepEqual(calls, ["prepare", "photos", "account", "closed", "notify", "auth"]);
  assert.deepEqual(retainSeen, [["keep.jpg"], ["keep.jpg"]]);
  assert.equal(result.deletedUser, true);
});
