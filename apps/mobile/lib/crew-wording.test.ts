import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/* eslint-disable @typescript-eslint/no-floating-promises */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function source(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("user-visible account-deletion and crew screens say crew, not group", () => {
  const checks: Array<{ file: string; forbidden: string[]; required: string[] }> = [
    {
      file: "apps/mobile/app/settings.tsx",
      forbidden: ["If you own a group", "A group with no other members"],
      required: ["DangerZoneCard"],
    },
    {
      file: "apps/mobile/app/(tabs)/community/index.tsx",
      forbidden: [
        "Close group menu",
        "Open group menu",
        "Switch group",
        "View group",
        "Back to group menu",
        "from the group",
        "Join a group",
        "create a group",
      ],
      required: [
        "Close crew menu",
        "Open crew menu",
        "Switch crew",
        "View crew",
        "Back to crew menu",
        "from the crew",
        "Join a crew",
        "create a crew",
      ],
    },
    {
      file: "apps/mobile/ui/block-sheet.tsx",
      forbidden: ["groups you share"],
      required: ["crews you share"],
    },
    {
      file: "apps/mobile/app/onboarding/groups.tsx",
      forbidden: ["join more groups", "Join a Group", "Start a new group", "Create a Group"],
      required: ["join more crews", "Join a Crew", "Start a new crew", "Create a Crew"],
    },
    {
      file: "apps/mobile/app/onboarding/join-group.tsx",
      forbidden: ["join a group", "Group could not be joined", "Join a group"],
      required: ["join a crew", "Crew could not be joined", "Join a crew"],
    },
    {
      file: "apps/mobile/app/onboarding/create-group.tsx",
      forbidden: [
        "Enter a group name",
        "create a group",
        "Group could not be created",
        "Group name",
        "Creating group",
        "Create a group",
      ],
      required: [
        "Enter a crew name",
        "create a crew",
        "Crew could not be created",
        "Crew name",
        "Creating crew",
        "Create a crew",
      ],
    },
    {
      file: "apps/mobile/app/join/[code].tsx",
      forbidden: [
        "Ask the group",
        "Loading group invite",
        "repin group",
        "Group could not be joined",
      ],
      required: [
        "Ask the crew",
        "Loading crew invite",
        "repin crew",
        "Crew could not be joined",
      ],
    },
    {
      file: "apps/api/app/join/[code]/page.tsx",
      forbidden: ["Group invite | repin", "Open a group invite"],
      required: ["Crew invite | repin", "Open a crew invite"],
    },
    {
      file: "apps/mobile/lib/group-board.ts",
      forbidden: ["Group could not be loaded"],
      required: ["Crew could not be loaded"],
    },
    {
      file: "apps/api/app/api/groups/route.ts",
      forbidden: ["Group name must be between 1 and 80 characters"],
      required: ["Crew name must be between 1 and 80 characters"],
    },
    {
      file: "apps/api/app/api/groups/search/route.ts",
      forbidden: ["Groups could not be searched"],
      required: ["Crews could not be searched"],
    },
    {
      file: "apps/api/app/api/groups/[id]/workouts/route.ts",
      forbidden: ["Group not found", "Invalid group ID"],
      required: ["Crew not found", "Invalid crew ID"],
    },
    {
      file: "apps/api/app/admin/reports/reports-view.tsx",
      forbidden: ['? "group" : "groups"'],
      required: ['? "crew" : "crews"', "DELETED_ACCOUNT_LABEL"],
    },
  ];

  for (const check of checks) {
    const text = source(check.file);
    for (const needle of check.forbidden) {
      assert.equal(text.includes(needle), false, `${check.file} still has ${needle}`);
    }
    for (const needle of check.required) {
      assert.equal(text.includes(needle), true, `${check.file} is missing ${needle}`);
    }
  }
});
