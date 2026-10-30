import { getPublicGroupInviteByCode } from "@repin/db";
import { inviteCodeSchema } from "@repin/validation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Group invite | repin",
  description: "Open a group invite in repin.",
};

export default async function GroupInviteLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const parsedCode = inviteCodeSchema.safeParse(code);
  const invite = parsedCode.success
    ? await getPublicGroupInviteByCode(parsedCode.data)
    : null;

  if (!invite) {
    return (
      <InvitePage>
        <BrandWordmark />
        <p className={styles.eyebrow}>GROUP INVITE</p>
        <h1 className={styles.title}>This invite is no longer available</h1>
        <p className={styles.body}>
          The invite code may be incorrect or unavailable. Ask the group for a
          current repin invite and try again.
        </p>
        <a className={styles.secondaryAction} href="/">
          Visit repin
        </a>
      </InvitePage>
    );
  }

  const mobileInviteUrl = `repin://join/${encodeURIComponent(invite.inviteCode)}`;

  return (
    <InvitePage>
      <BrandWordmark />
      <p className={styles.eyebrow}>YOU’VE BEEN INVITED TO JOIN</p>
      <h1 className={styles.title}>{invite.name}</h1>
      <p className={styles.body}>
        Open this invite in repin to sign in and join the group. You can also
        enter the invite code manually in the app.
      </p>
      <div className={styles.codePanel}>
        <span className={styles.codeLabel}>INVITE CODE</span>
        <strong className={styles.code}>{invite.inviteCode}</strong>
      </div>
      <a className={styles.primaryAction} href={mobileInviteUrl}>
        Open in repin
      </a>
      <p className={styles.helper}>
        Joining requires the repin mobile app and an authenticated account.
      </p>
    </InvitePage>
  );
}

function BrandWordmark() {
  return (
    <div aria-label="repin" className={styles.brand}>
      rep<span className={styles.brandIn}>in</span>
    </div>
  );
}

function InvitePage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.content}>{children}</section>
    </main>
  );
}
