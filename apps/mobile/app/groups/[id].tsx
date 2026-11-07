import { getUserInitials, type CrewMemberSummary, type CrewPage } from "@repin/types";
import {
  crewCopy,
  crewPagePermissions,
  firstNameForToast,
  formatCreatedLabel,
  formatMemberCount,
  formatWorkoutsThisWeek,
} from "@repin/validation";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchCrewPage,
  leaveCrewRequest,
  removeCrewMemberRequest,
  resetCrewInvite,
  saveCrewNotifications,
  transferCrew,
  updateCrew,
} from "../../lib/crew-api";
import { supabase } from "../../lib/supabase";
import { Button, Card, LoadingState, StateCard } from "../../ui/components";
import {
  ConfirmSheet,
  EditCrewSheet,
  MemberMenu,
  NotificationsSheet,
  OwnerLeaveBlockedSheet,
  TransferPickSheet,
} from "../../ui/crew-sheets";
import { Icon } from "../../ui/icons";
import { TwoPane, useLayoutMode } from "../../ui/layout";
import { ListRow, RoundIconButton } from "../../ui/primitives";
import { usePushPermission } from "../../ui/push-notifications-host";
import {
  crewPushedHeaderInset,
  pushedHeaderScreenOptions,
  pushedNativeHeaderEnabled,
  pushedShowsRoundBack,
} from "../../ui/pushed-header";
import { colors, fonts, radii, size, spacing, type } from "../../ui/theme";
import { useStripState } from "../../ui/vertical-bar-edge";

const configuredPublicWebUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? "").trim().replace(/\/$/, "");
const publicWebUrl = configuredPublicWebUrl.startsWith("https://")
  ? configuredPublicWebUrl
  : "https://repin.vercel.app";

type Sheet =
  | "edit"
  | "notifications"
  | "reset"
  | "leave"
  | "leave-blocked"
  | "remove"
  | "transfer"
  | "transfer-pick"
  | null;

export default function CrewPageScreen() {
  const router = useRouter();
  const { mode } = useLayoutMode();
  const { osStatus, promptFromSettings } = usePushPermission();
  const strip = useStripState();
  const nativeHeader = pushedNativeHeaderEnabled(Platform.OS);
  const roundBack = pushedShowsRoundBack(Platform.OS);
  const headerClearance = crewPushedHeaderInset(Platform.OS, strip);
  const twoPane = mode === "twoPane";
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [page, setPage] = useState<CrewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menuMember, setMenuMember] = useState<CrewMemberSummary | null>(null);
  const [pendingMember, setPendingMember] = useState<CrewMemberSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pickedPhoto, setPickedPhoto] = useState<{
    base64: string;
    mimeType: string;
    path: string;
  } | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 2_000);
  }, []);

  const loadCrew = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!groupId) throw new Error("This crew link is invalid.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to view this crew.");
      setPage(await fetchCrewPage({ accessToken: data.session.access_token, groupId }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Crew could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void loadCrew(); }, [loadCrew]));

  const withSession = useCallback(async (run: (accessToken: string) => Promise<void>) => {
    if (!supabase || !groupId) throw new Error("Sign in to manage this crew.");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) throw new Error("Sign in to manage this crew.");
    await run(data.session.access_token);
  }, [groupId]);

  const copyInvite = useCallback(async () => {
    const code = page?.group.inviteCode;
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      showToast(crewCopy.toastCopied);
    } catch {
      setError("Invite code could not be copied.");
    }
  }, [page, showToast]);

  const shareInvite = useCallback(async () => {
    if (!page?.group.inviteCode) return;
    try {
      const inviteUrl = `${publicWebUrl}/join/${encodeURIComponent(page.group.inviteCode)}`;
      await Share.share({
        message: `Join my repin crew ‘${page.group.name}’. Invite code: ${page.group.inviteCode}\n${inviteUrl}`,
      });
    } catch {
      setError("Invite could not be shared.");
    }
  }, [page]);

  const pickPhoto = useCallback(async () => {
    if (!supabase || !page) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to set a crew photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      base64: true,
      mediaTypes: ["images"],
      quality: 0.85,
      selectionLimit: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError("That photo could not be read. Try another image.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const extension = asset.mimeType?.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    setPickedPhoto({
      base64: asset.base64,
      mimeType: asset.mimeType ?? "image/jpeg",
      path: `${page.group.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`,
    });
  }, [page]);

  const saveEdit = useCallback(async (name: string) => {
    const client = supabase;
    if (!page || !client) return;
    setPending(true);
    setError(null);
    try {
      await withSession(async (accessToken) => {
        let photoPath: string | undefined;
        if (pickedPhoto) {
          const { error: uploadError } = await client.storage.from("crew-photos").upload(
            pickedPhoto.path,
            decodeBase64(pickedPhoto.base64),
            { contentType: pickedPhoto.mimeType, upsert: false },
          );
          if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
          photoPath = pickedPhoto.path;
        }
        await updateCrew({ accessToken, groupId: page.group.id, name, photoPath });
      });
      setSheet(null);
      setPickedPhoto(null);
      await loadCrew();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Crew could not be updated.");
    } finally {
      setPending(false);
    }
  }, [loadCrew, page, pickedPhoto, withSession]);

  const confirmReset = useCallback(async () => {
    if (!page) return;
    setPending(true);
    try {
      await withSession(async (accessToken) => {
        const inviteCode = await resetCrewInvite({ accessToken, groupId: page.group.id });
        setPage((current) => current
          ? { ...current, group: { ...current.group, inviteCode } }
          : current);
      });
      setSheet(null);
      showToast(crewCopy.toastReset);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Invite code could not be reset.");
    } finally {
      setPending(false);
    }
  }, [page, showToast, withSession]);

  const confirmTransfer = useCallback(async () => {
    if (!page || !pendingMember) return;
    setPending(true);
    try {
      await withSession((accessToken) => transferCrew({
        accessToken,
        groupId: page.group.id,
        userId: pendingMember.userId,
      }));
      setSheet(null);
      setPendingMember(null);
      await loadCrew();
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Ownership could not be transferred.");
    } finally {
      setPending(false);
    }
  }, [loadCrew, page, pendingMember, withSession]);

  const confirmRemove = useCallback(async () => {
    if (!page || !pendingMember) return;
    setPending(true);
    try {
      let displayName = pendingMember.displayName;
      await withSession(async (accessToken) => {
        displayName = await removeCrewMemberRequest({
          accessToken,
          groupId: page.group.id,
          userId: pendingMember.userId,
        });
      });
      setSheet(null);
      setPendingMember(null);
      showToast(crewCopy.toastRemoved(firstNameForToast(displayName)));
      await loadCrew();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Member could not be removed.");
    } finally {
      setPending(false);
    }
  }, [loadCrew, page, pendingMember, showToast, withSession]);

  const confirmLeave = useCallback(async () => {
    if (!page) return;
    setPending(true);
    try {
      await withSession(async (accessToken) => {
        await leaveCrewRequest({ accessToken, groupId: page.group.id });
      });
      setSheet(null);
      router.back();
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Could not leave the crew.");
    } finally {
      setPending(false);
    }
  }, [page, router, withSession]);

  const group = page?.group ?? null;
  const members = page?.members ?? [];
  const transferCandidates = members.filter((member) => !member.isYou);
  const permissions = crewPagePermissions({
    role: group?.role ?? "member",
    memberCount: members.length,
  });
  const openTransfer = (member?: CrewMemberSummary) => {
    if (member) {
      setPendingMember(member);
      setSheet("transfer");
      return;
    }
    const onlyCandidate = transferCandidates[0];
    if (transferCandidates.length === 1 && onlyCandidate) {
      setPendingMember(onlyCandidate);
      setSheet("transfer");
      return;
    }
    if (transferCandidates.length > 1) setSheet("transfer-pick");
  };
  const settings = (
    <SettingsCard
      notificationsSummary={page?.notifications.summary ?? "All on"}
      onEdit={() => setSheet("edit")}
      onLeave={() => setSheet(permissions.ownerMustTransferToLeave ? "leave-blocked" : "leave")}
      onNotifications={() => setSheet("notifications")}
      onReset={() => setSheet("reset")}
      onTransfer={() => openTransfer()}
      permissions={permissions}
    />
  );

  return (
    <>
      {nativeHeader ? (
        <Stack.Screen options={{ ...pushedHeaderScreenOptions(), headerTitle: "Crew", title: "Crew" }} />
      ) : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={headerClearance > 0 ? [styles.flex, { paddingTop: headerClearance }] : styles.flex}>
          <TwoPane
            column="readable"
            contentPaddingBottom={spacing.xxl}
            fallback="stack"
            left={(
              <View style={styles.pane}>
                <View style={styles.titleRow}>
                  {roundBack ? (
                    <RoundIconButton accessibilityLabel="Back" kind="back" onPress={() => router.back()} />
                  ) : null}
                  {roundBack ? <Text style={styles.screenTitle}>Crew</Text> : null}
                </View>
                {loading && !page ? <LoadingState message="Loading crew…" /> : error && !page ? (
                  <StateCard actionLabel="Try again" message={error} onAction={() => void loadCrew()} title="Unable to open crew" />
                ) : group ? (
                  <>
                    {error ? <Text style={styles.refreshError}>{error}</Text> : null}
                    <CrewHeader group={group} />
                    {group.inviteCode ? (
                      <InviteCard
                        inviteCode={group.inviteCode}
                        onCopy={() => void copyInvite()}
                        onShare={() => void shareInvite()}
                      />
                    ) : null}
                    {twoPane ? <View style={styles.settingsWrap}>{settings}</View> : null}
                  </>
                ) : null}
              </View>
            )}
            right={group ? (
              <View style={styles.pane}>
                <MembersCard
                  isOwner={group.role === "owner"}
                  members={members}
                  onOpenMenu={(member) => setMenuMember(member)}
                  twoPane={twoPane}
                />
                {twoPane ? null : <View style={styles.settingsWrap}>{settings}</View>}
              </View>
            ) : (
              <View />
            )}
          />
        </View>
        {toast ? (
          <View accessibilityLiveRegion="polite" style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        <MemberMenu
          onDismiss={() => setMenuMember(null)}
          onMakeOwner={() => {
            if (!menuMember) return;
            const member = menuMember;
            setMenuMember(null);
            openTransfer(member);
          }}
          onRemove={() => {
            if (!menuMember) return;
            setPendingMember(menuMember);
            setMenuMember(null);
            setSheet("remove");
          }}
          visible={Boolean(menuMember)}
        />
        <EditCrewSheet
          name={group?.name ?? ""}
          onDismiss={() => { setSheet(null); setPickedPhoto(null); }}
          onPickPhoto={() => void pickPhoto()}
          onSave={(name) => void saveEdit(name)}
          pending={pending}
          photoLabel={pickedPhoto ? "Photo selected" : "Choose photo"}
          visible={sheet === "edit"}
        />
        <NotificationsSheet
          deviceAlertsOn={osStatus === "granted"}
          onDismiss={() => setSheet(null)}
          onEnableDeviceAlerts={promptFromSettings}
          onSave={(prefs) => {
            void (async () => {
              if (!page) return;
              setPending(true);
              try {
                await withSession(async (accessToken) => {
                  const notifications = await saveCrewNotifications({
                    accessToken,
                    groupId: page.group.id,
                    prefs,
                  });
                  setPage((current) => current ? { ...current, notifications } : current);
                });
                setSheet(null);
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : "Notification prefs could not be saved.");
              } finally {
                setPending(false);
              }
            })();
          }}
          pending={pending}
          prefs={page?.notifications ?? { muteAll: false, crewComment: true, crewReaction: true, crewWorkout: true }}
          visible={sheet === "notifications"}
        />
        <ConfirmSheet
          body={crewCopy.resetBody}
          confirmLabel="Reset code"
          onConfirm={() => void confirmReset()}
          onDismiss={() => setSheet(null)}
          pending={pending}
          title={crewCopy.resetTitle}
          visible={sheet === "reset"}
        />
        <ConfirmSheet
          body={pendingMember ? crewCopy.transferBody(firstNameForToast(pendingMember.displayName)) : ""}
          confirmLabel="Make owner"
          confirmVariant="primary"
          onConfirm={() => void confirmTransfer()}
          onDismiss={() => { setSheet(null); setPendingMember(null); }}
          pending={pending}
          title={crewCopy.transferTitle}
          visible={sheet === "transfer"}
        />
        <ConfirmSheet
          body={pendingMember ? crewCopy.removeBody(firstNameForToast(pendingMember.displayName)) : ""}
          confirmLabel="Remove"
          onConfirm={() => void confirmRemove()}
          onDismiss={() => { setSheet(null); setPendingMember(null); }}
          pending={pending}
          title={crewCopy.removeTitle}
          visible={sheet === "remove"}
        />
        <ConfirmSheet
          body={group ? crewCopy.leaveMemberBody(group.name) : ""}
          confirmLabel="Leave"
          onConfirm={() => void confirmLeave()}
          onDismiss={() => setSheet(null)}
          pending={pending}
          title={crewCopy.leaveTitle}
          visible={sheet === "leave"}
        />
        <OwnerLeaveBlockedSheet
          onDismiss={() => setSheet(null)}
          onTransfer={() => openTransfer()}
          visible={sheet === "leave-blocked"}
        />
        <TransferPickSheet
          members={transferCandidates}
          onDismiss={() => setSheet(null)}
          onPick={(member) => {
            const row = members.find((item) => item.userId === member.userId);
            if (row) openTransfer(row);
          }}
          visible={sheet === "transfer-pick"}
        />
      </SafeAreaView>
    </>
  );
}

function CrewHeader({ group }: { group: CrewPage["group"] }) {
  const mark = group.name[0]?.toUpperCase() ?? "C";
  return (
    <View style={styles.hero}>
      {group.photoUrl ? (
        <Image source={{ uri: group.photoUrl }} style={styles.groupMark} />
      ) : (
        <View style={styles.groupMark}>
          <Text style={styles.groupMarkText}>{mark}</Text>
        </View>
      )}
      <View style={styles.heroCopy}>
        <Text numberOfLines={1} style={styles.title}>{group.name}</Text>
        <Text style={styles.meta}>
          {formatMemberCount(group.memberCount)} · {formatCreatedLabel(group.createdAt)}
        </Text>
      </View>
      <View style={styles.roleChip}>
        <Text style={styles.roleText}>{group.role === "owner" ? "Owner" : "Member"}</Text>
      </View>
    </View>
  );
}

function InviteCard({
  inviteCode,
  onCopy,
  onShare,
}: {
  inviteCode: string;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <Card style={styles.inviteCard}>
      <Text style={styles.inviteLabel}>INVITE CODE</Text>
      <Text accessibilityLabel={`Invite code ${inviteCode}`} selectable style={styles.inviteCode}>{inviteCode}</Text>
      <View style={styles.inviteActions}>
        <View style={styles.inviteAction}>
          <Button onPress={onCopy} style={styles.inviteButton} variant="tonal">Copy</Button>
        </View>
        <View style={styles.inviteAction}>
          <Button onPress={onShare} style={styles.inviteButton}>Share</Button>
        </View>
      </View>
    </Card>
  );
}

function MembersCard({
  isOwner,
  members,
  onOpenMenu,
  twoPane,
}: {
  isOwner: boolean;
  members: CrewMemberSummary[];
  onOpenMenu: (member: CrewMemberSummary) => void;
  twoPane: boolean;
}) {
  return (
    <View>
      {twoPane ? (
        <View style={styles.membersPaneHeader}>
          <Text style={styles.membersTitle}>Members</Text>
          <Text style={styles.membersSub}>{members.length} people · invite-only</Text>
        </View>
      ) : (
        <Text style={styles.sectionEyebrow}>MEMBERS</Text>
      )}
      <Card style={twoPane ? styles.membersPane : undefined}>
        {members.map((member, index) => (
          <View key={member.userId}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            <MemberRow
              member={member}
              onOpenMenu={isOwner && !member.isYou ? () => onOpenMenu(member) : undefined}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

function MemberRow({
  member,
  onOpenMenu,
}: {
  member: CrewMemberSummary;
  onOpenMenu?: () => void;
}) {
  const initials = getUserInitials({ displayName: member.displayName });
  return (
    <View style={styles.memberRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.memberCopy}>
        <View style={styles.memberNameRow}>
          <Text numberOfLines={1} style={styles.memberName}>{member.displayName}</Text>
          {member.role === "owner" ? <View style={styles.badge}><Text style={styles.badgeText}>Owner</Text></View> : null}
          {member.isYou ? <View style={styles.youBadge}><Text style={styles.youText}>You</Text></View> : null}
        </View>
        <Text style={styles.memberMeta}>{formatWorkoutsThisWeek(member.workoutsThisWeek)}</Text>
      </View>
      {onOpenMenu ? (
        <Pressable
          accessibilityLabel={`More actions for ${member.displayName}`}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={onOpenMenu}
          style={styles.moreButton}
        >
          <Icon color={colors.muted} name="ellipsis" />
        </Pressable>
      ) : null}
    </View>
  );
}

function SettingsCard({
  notificationsSummary,
  onEdit,
  onLeave,
  onNotifications,
  onReset,
  onTransfer,
  permissions,
}: {
  notificationsSummary: string;
  onEdit: () => void;
  onLeave: () => void;
  onNotifications: () => void;
  onReset: () => void;
  onTransfer: () => void;
  permissions: ReturnType<typeof crewPagePermissions>;
}) {
  return (
    <View>
      <Text style={styles.sectionEyebrow}>SETTINGS</Text>
      <Card>
        {permissions.canRename ? <ListRow label="Rename crew" onPress={onEdit} /> : null}
        {permissions.canEditPhoto ? (
          <>
            <View style={styles.rowDivider} />
            <ListRow label="Edit photo" onPress={onEdit} />
          </>
        ) : null}
        {permissions.canResetInvite ? (
          <>
            <View style={styles.rowDivider} />
            <ListRow label="Reset invite code" onPress={onReset} />
          </>
        ) : null}
        {permissions.canTransfer ? (
          <>
            <View style={styles.rowDivider} />
            <ListRow label="Transfer ownership" onPress={onTransfer} />
          </>
        ) : null}
        {(permissions.canRename || permissions.canResetInvite) ? <View style={styles.rowDivider} /> : null}
        <ListRow label="Notifications" onPress={onNotifications} value={notificationsSummary} />
        <View style={styles.rowDivider} />
        <Pressable
          accessibilityRole="button"
          onPress={onLeave}
          style={({ pressed }) => [styles.leaveRow, pressed && styles.leavePressed]}
        >
          <Text style={styles.leaveText}>Leave crew</Text>
        </Pressable>
      </Card>
      {permissions.showSoloLeaveHelper ? (
        <Text style={styles.soloHelper}>{crewCopy.soloLeaveHelper}</Text>
      ) : null}
    </View>
  );
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  pane: { flexGrow: 1 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  screenTitle: { color: colors.ink, ...type.screenTitle },
  refreshError: { color: colors.danger, ...type.bodySmall, marginBottom: spacing.md },
  hero: { alignItems: "center", flexDirection: "row" },
  groupMark: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    height: size.primary,
    justifyContent: "center",
    overflow: "hidden",
    width: size.primary,
  },
  groupMarkText: { color: colors.surface, ...type.title },
  heroCopy: { flex: 1, marginHorizontal: spacing.md, minWidth: 0 },
  title: { color: colors.ink, ...type.heading },
  meta: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  roleChip: {
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  roleText: { color: colors.brandPressed, ...type.micro },
  inviteCard: { gap: spacing.md, marginTop: spacing.xl },
  inviteLabel: { color: colors.brandPressed, ...type.eyebrow },
  inviteCode: { color: colors.ink, ...type.title, letterSpacing: 2 },
  inviteActions: { flexDirection: "row", gap: spacing.sm },
  inviteAction: { flex: 1 },
  inviteButton: { height: size.primary, minHeight: size.primary },
  sectionEyebrow: { color: colors.brandPressed, ...type.eyebrow, marginBottom: spacing.sm, marginTop: spacing.xxl },
  settingsWrap: { marginTop: spacing.sm },
  membersPaneHeader: { marginBottom: spacing.md },
  membersTitle: { color: colors.ink, ...type.heading },
  membersSub: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs },
  membersPane: { flexGrow: 1 },
  rowDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: size.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    height: size.avatars.sm,
    justifyContent: "center",
    width: size.avatars.sm,
  },
  avatarText: { color: colors.brandPressed, ...type.micro },
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  memberName: { color: colors.ink, ...type.body, flexShrink: 1, fontFamily: fonts.semibold },
  memberMeta: { color: colors.muted, ...type.bodySmall },
  badge: {
    backgroundColor: colors.brandTint,
    borderColor: colors.boardBorder,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: colors.brandPressed, ...type.micro },
  youBadge: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.boardBorder,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  youText: { color: colors.muted, ...type.micro },
  moreButton: { alignItems: "center", height: size.hit, justifyContent: "center", width: size.hit },
  leaveRow: { justifyContent: "center", minHeight: size.primary, paddingHorizontal: spacing.lg },
  leavePressed: { backgroundColor: colors.selection },
  leaveText: { color: colors.danger, ...type.body, fontFamily: fonts.semibold },
  soloHelper: { color: colors.muted, ...type.bodySmall, marginTop: spacing.md },
  toast: {
    alignSelf: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    bottom: spacing.huge,
    left: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    position: "absolute",
    right: spacing.lg,
  },
  toastText: { color: colors.surface, ...type.body, fontFamily: fonts.semibold },
});
