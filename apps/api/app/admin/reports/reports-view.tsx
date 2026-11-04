"use client";

import { contentReportReasonLabels } from "@repin/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  dueState,
  formatAge,
  formatClock,
  formatContentTime,
  formatResolvedTime,
} from "../../../lib/admin-review";
import type { SerializedAdminQueueItem } from "../../../lib/admin-queue";

import styles from "./page.module.css";
import { SignInForm } from "./sign-in-form";

export function ReportsView({
  email,
  initialQueue,
}: {
  email: string | null;
  initialQueue: SerializedAdminQueueItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [now, setNow] = useState(() => new Date());
  const [queue, setQueue] = useState(initialQueue);
  const [selectedId, setSelectedId] = useState(initialQueue.find((item) => item.status === "open")?.id ?? initialQueue[0]?.id ?? null);
  const [pending, setPending] = useState<"remove" | "keep" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
    setSelectedId((current) => {
      if (current && initialQueue.some((item) => item.id === current)) return current;
      return initialQueue.find((item) => item.status === "open")?.id ?? initialQueue[0]?.id ?? null;
    });
  }, [initialQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const openItems = useMemo(() => queue.filter((item) => item.status === "open"), [queue]);
  const resolvedItems = useMemo(() => queue.filter((item) => item.status !== "open"), [queue]);
  const items = tab === "open" ? openItems : resolvedItems;
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const runAction = async (action: "remove" | "keep" | "restore", reportId: string) => {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.status === 404) {
        setError("This page isn't available.");
        return;
      }
      if (!response.ok) {
        setError("Couldn't save. Check your connection and try again.");
        return;
      }
      if (action === "restore") setTab("open");
      else setTab("resolved");
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.lockup}>
          <span className={styles.wordmark} aria-label="repin">
            rep<span className={styles.wordmarkIn}>in</span>
          </span>
          <span className={styles.moderation}>MODERATION</span>
        </div>
        {email ? (
          <p className={styles.signedIn}>Signed in as {email} (repin team)</p>
        ) : null}
      </header>

      {email ? (
        <>
          <p className={styles.narrowNote}>Open this page on a computer to review reports.</p>
          <div className={styles.workspace}>
            <section className={styles.queue} aria-label="Report queue">
              <h1 className={styles.title}>Reports</h1>
              <div className={styles.tabs} role="tablist" aria-label="Report status">
                <TabButton
                  active={tab === "open"}
                  label={`Open ${openItems.length}`}
                  onSelect={() => {
                    setTab("open");
                    setSelectedId(openItems[0]?.id ?? null);
                  }}
                />
                <TabButton
                  active={tab === "resolved"}
                  label="Resolved"
                  onSelect={() => {
                    setTab("resolved");
                    setSelectedId(resolvedItems[0]?.id ?? null);
                  }}
                />
              </div>
              {items.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{tab === "open" ? "No open reports" : "No resolved reports"}</p>
                  <p className={styles.emptyBody}>
                    {tab === "open"
                      ? "New reports will show up here."
                      : "Kept and removed items will show up here."}
                  </p>
                </div>
              ) : (
                <ul className={styles.cards}>
                  {items.map((item) => {
                    const due = dueState(new Date(item.firstReportedAt), now);
                    const selectedCard = selected?.id === item.id;
                    return (
                      <li className={`${styles.card} ${selectedCard ? styles.cardSelected : ""}`} key={item.id}>
                        <button
                          className={styles.cardButton}
                          onClick={() => setSelectedId(item.id)}
                          type="button"
                        >
                          <div className={styles.cardTop}>
                            <span className={styles.reasonChip}>{contentReportReasonLabels[item.reason]}</span>
                            {item.status === "open" ? (
                              <span className={due.tone === "danger" ? styles.dueDanger : styles.due}>
                                {due.label}
                              </span>
                            ) : (
                              <span className={styles.due}>{outcomeLabel(item)}</span>
                            )}
                          </div>
                          <p className={styles.cardTitle}>
                            {item.targetType === "comment" ? "Comment" : "Post"} by {item.authorDisplayName}
                          </p>
                          <p className={styles.cardMeta}>
                            {item.groupName}
                            {" · "}
                            {item.reportCount} {item.reportCount === 1 ? "report" : "reports"}
                            {" · "}
                            {formatAge(new Date(item.firstReportedAt), now)}
                          </p>
                        </button>
                        {item.status === "removed" && item.contentRemoved ? (
                          <button
                            className={styles.restoreLink}
                            onClick={() => void runAction("restore", item.id)}
                            type="button"
                          >
                            Restore
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={styles.detail} aria-live="polite">
              {selected ? (
                <DetailPane
                  error={error}
                  item={selected}
                  now={now}
                  pending={pending}
                  onAction={runAction}
                />
              ) : (
                <div className={styles.detailEmpty}>
                  <p className={styles.emptyTitle}>Select a report</p>
                  <p className={styles.emptyBody}>Choose an item from the queue to review it.</p>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <SignInForm />
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`${styles.tab} ${active ? styles.tabActive : ""}`}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function DetailPane({
  error,
  item,
  now,
  onAction,
  pending,
}: {
  error: string | null;
  item: SerializedAdminQueueItem;
  now: Date;
  onAction: (action: "remove" | "keep" | "restore", reportId: string) => void;
  pending: "remove" | "keep" | "restore" | null;
}) {
  const noun = item.targetType === "comment" ? "comment" : "post";
  const canRestore = item.status === "removed" && item.contentRemoved && !item.contentMissing;
  const context = item.workoutName
    ? `${item.groupName} · on "${item.workoutName}"`
    : item.groupName;

  return (
    <>
      <div className={styles.detailHead}>
        <h2 className={styles.detailTitle}>Reported {noun}</h2>
        <p className={styles.detailContext}>{context}</p>
      </div>

      <div className={styles.preview}>
        {item.contentMissing ? (
          <p className={styles.previewBody}>
            {item.targetType === "comment"
              ? "This comment isn't available."
              : "This post isn't available."}
          </p>
        ) : (
          <>
            <p className={styles.previewMeta}>
              {item.authorDisplayName}
              {item.contentCreatedAt ? ` · ${formatContentTime(new Date(item.contentCreatedAt), now)}` : ""}
            </p>
            {item.contentText ? <p className={styles.previewBody}>{item.contentText}</p> : null}
            {item.photoUrl ? (
              <img alt="" className={styles.previewPhoto} src={item.photoUrl} />
            ) : null}
          </>
        )}
      </div>

      <h3 className={styles.sectionTitle}>Reports ({item.reportCount})</h3>
      <ul className={styles.reportList}>
        {item.reports.map((report) => (
          <li className={styles.reportRow} key={report.id}>
            <div className={styles.reportCopy}>
              <p className={styles.reportWho}>
                {report.reporterDisplayName} · {contentReportReasonLabels[report.reason]}
              </p>
              <p className={styles.reportDetails}>{report.details?.trim() || "No details"}</p>
            </div>
            <time className={styles.reportTime} dateTime={report.createdAt}>
              {formatClock(new Date(report.createdAt))}
            </time>
          </li>
        ))}
      </ul>

      <h3 className={styles.sectionTitle}>Author history</h3>
      <p className={styles.history}>
        {item.authorHistory.displayName}
        {" · "}
        {item.authorHistory.removedCount} removed before
        {" · "}
        in {item.authorHistory.groupCount} {item.authorHistory.groupCount === 1 ? "group" : "groups"}
      </p>

      <div className={styles.detailFooter}>
        {item.status === "open" ? (
          <p className={styles.helper}>
            Removing hides it for everyone. Reporters are not named to the author.
          </p>
        ) : (
          <p className={styles.helper}>{resolvedSummary(item)}</p>
        )}
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        {item.status === "open" ? (
          <div className={styles.actions}>
            <button
              className={styles.dangerButton}
              disabled={pending !== null}
              onClick={() => onAction("remove", item.id)}
              type="button"
            >
              {pending === "remove" ? "Removing" : `Remove ${noun}`}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={pending !== null}
              onClick={() => onAction("keep", item.id)}
              type="button"
            >
              {pending === "keep" ? "Keeping" : "Keep it"}
            </button>
          </div>
        ) : canRestore ? (
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              disabled={pending !== null}
              onClick={() => onAction("restore", item.id)}
              type="button"
            >
              {pending === "restore" ? "Restoring" : "Restore"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function outcomeLabel(item: SerializedAdminQueueItem) {
  if (item.status === "removed") return "Removed";
  return "Kept";
}

function resolvedSummary(item: SerializedAdminQueueItem) {
  const verb = item.status === "removed" ? "Removed" : "Kept";
  const who = item.resolvedByDisplayName ? ` by ${item.resolvedByDisplayName}` : "";
  const when = item.resolvedAt ? ` · ${formatResolvedTime(new Date(item.resolvedAt))}` : "";
  return `${verb}${who}${when}.`;
}
