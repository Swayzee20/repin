import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import {
  crewCopy,
  crewMarkTiles,
  type CrewNotificationPrefs,
} from "@repin/validation";

import { Button } from "./components";
import { FieldLabel, TextField } from "./form-fields";
import { Icon } from "./icons";
import { BottomSheet } from "./sheet";
import { colors, elevation, fonts, radii, size, spacing, type } from "./theme";

export function ConfirmSheet({
  body,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onDismiss,
  pending = false,
  title,
  visible,
}: {
  body: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onDismiss: () => void;
  pending?: boolean;
  title: string;
  visible: boolean;
}) {
  return (
    <BottomSheet onDismiss={onDismiss} title={title} visible={visible}>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button disabled={pending} onPress={onDismiss} variant="tonal">Cancel</Button>
        </View>
        <View style={styles.action}>
          <Button
            loading={pending}
            onPress={onConfirm}
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

export function OwnerLeaveBlockedSheet({
  onDismiss,
  onTransfer,
  visible,
}: {
  onDismiss: () => void;
  onTransfer: () => void;
  visible: boolean;
}) {
  return (
    <BottomSheet onDismiss={onDismiss} title={crewCopy.leaveTitle} visible={visible}>
      <Text style={styles.body}>{crewCopy.leaveOwnerBlockedBody}</Text>
      <View style={styles.stack}>
        <Button onPress={onTransfer}>Transfer ownership</Button>
        <Button onPress={onDismiss} variant="tonal">Cancel</Button>
      </View>
    </BottomSheet>
  );
}

export function EditCrewSheet({
  name,
  onDismiss,
  onPickPhoto,
  onSave,
  pending,
  photoLabel,
  visible,
}: {
  name: string;
  onDismiss: () => void;
  onPickPhoto: () => void;
  onSave: (name: string) => void;
  pending: boolean;
  photoLabel: string;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    if (visible) setDraft(name);
  }, [name, visible]);
  const tiles = crewMarkTiles(draft || name);

  return (
    <BottomSheet onDismiss={onDismiss} title="Edit crew" visible={visible}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <TextField
          autoCapitalize="words"
          label="Crew name"
          onChangeText={setDraft}
          value={draft}
        />
        <FieldLabel label="Crew mark" />
        <View style={styles.marks}>
          {tiles.map((letter, index) => {
            const selected = index === 0;
            return (
              <View
                key={`${letter}-${index}`}
                style={[styles.mark, selected ? styles.markSelected : styles.markIdle]}
              >
                <Text style={[styles.markText, selected ? styles.markTextSelected : styles.markTextIdle]}>
                  {letter}
                </Text>
              </View>
            );
          })}
        </View>
        <Button onPress={onPickPhoto} variant="tonal">{photoLabel}</Button>
        <Text style={styles.helper}>{crewCopy.privacyHelper}</Text>
        <Button
          disabled={!draft.trim()}
          loading={pending}
          loadingLabel="Saving"
          onPress={() => onSave(draft.trim())}
        >
          Save
        </Button>
      </ScrollView>
    </BottomSheet>
  );
}

export function NotificationsSheet({
  onDismiss,
  onSave,
  pending,
  prefs,
  visible,
}: {
  onDismiss: () => void;
  onSave: (prefs: CrewNotificationPrefs) => void;
  pending: boolean;
  prefs: CrewNotificationPrefs;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(prefs);
  useEffect(() => {
    if (visible) setDraft(prefs);
  }, [prefs, visible]);

  const muted = draft.muteAll;
  const setAlert = (key: keyof Omit<CrewNotificationPrefs, "muteAll">, value: boolean) => {
    setDraft((current) => ({ ...current, [key]: value, muteAll: false }));
  };

  return (
    <BottomSheet onDismiss={onDismiss} title="Notifications" visible={visible}>
      <Text style={styles.body}>{crewCopy.notificationsIntro}</Text>
      <View style={styles.muteRow}>
        <Text style={styles.muteLabel}>Mute all from this crew</Text>
        <CrewSwitch
          accessibilityLabel={`Mute all from this crew, ${draft.muteAll ? "On" : "Off"}`}
          onValueChange={(value) => {
            setDraft((current) => (
              value
                ? { muteAll: true, crewWorkout: false, crewComment: false, crewReaction: false }
                : { ...current, muteAll: false }
            ));
          }}
          value={draft.muteAll}
        />
      </View>
      <Text style={styles.alertsEyebrow}>ALERTS</Text>
      <View style={styles.alerts}>
        <AlertRow
          disabled={muted}
          label="New workouts from your crew"
          onValueChange={(value) => setAlert("crewWorkout", value)}
          value={draft.crewWorkout}
        />
        <AlertRow
          disabled={muted}
          label="Comments on your posts"
          onValueChange={(value) => setAlert("crewComment", value)}
          value={draft.crewComment}
        />
        <AlertRow
          disabled={muted}
          divider={false}
          label="Reactions on your posts"
          onValueChange={(value) => setAlert("crewReaction", value)}
          value={draft.crewReaction}
        />
      </View>
      <Button loading={pending} loadingLabel="Saving" onPress={() => onSave(draft)}>Done</Button>
    </BottomSheet>
  );
}

function AlertRow({
  disabled,
  divider = true,
  label,
  onValueChange,
  value,
}: {
  disabled: boolean;
  divider?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={[styles.alertRow, divider && styles.alertDivider]}>
      <Text style={[styles.alertLabel, disabled && styles.alertDisabled]}>{label}</Text>
      <CrewSwitch
        accessibilityLabel={`${label}, ${value ? "On" : "Off"}`}
        disabled={disabled}
        onValueChange={onValueChange}
        value={value && !disabled}
      />
    </View>
  );
}

export function CrewSwitch({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  value,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View style={styles.switchHit}>
      <Switch
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.disabledFill, true: colors.brand }}
        value={value}
      />
    </View>
  );
}

export function TransferPickSheet({
  members,
  onDismiss,
  onPick,
  visible,
}: {
  members: Array<{ userId: string; displayName: string }>;
  onDismiss: () => void;
  onPick: (member: { userId: string; displayName: string }) => void;
  visible: boolean;
}) {
  return (
    <BottomSheet onDismiss={onDismiss} title={crewCopy.transferTitle} visible={visible}>
      <Text style={styles.body}>Pick who should become the owner. You’ll become a regular member.</Text>
      {members.map((member) => (
        <Pressable
          key={member.userId}
          accessibilityRole="button"
          onPress={() => onPick(member)}
          style={({ pressed }) => [styles.pickRow, pressed && styles.menuPressed]}
        >
          <Text style={styles.menuLabel}>{member.displayName}</Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

export function MemberMenu({
  onDismiss,
  onMakeOwner,
  onRemove,
  visible,
}: {
  onDismiss: () => void;
  onMakeOwner: () => void;
  onRemove: () => void;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Pressable accessibilityLabel="Close member menu" onPress={onDismiss} style={styles.menuBackdrop}>
      <View style={styles.menuCard}>
        <Pressable
          accessibilityRole="button"
          onPress={onMakeOwner}
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed]}
        >
          <Icon color={colors.ink} name="person.2" />
          <Text style={styles.menuLabel}>Make owner</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRemove}
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed]}
        >
          <Icon color={colors.danger} name="nosign" />
          <Text style={styles.menuDanger}>Remove from crew</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.inkSoft, ...type.body, marginBottom: spacing.xl },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  stack: { gap: spacing.sm },
  marks: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, marginTop: spacing.sm },
  mark: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: size.primary,
    justifyContent: "center",
    width: size.primary,
  },
  markSelected: { backgroundColor: colors.brand },
  markIdle: { backgroundColor: colors.brandTint },
  markText: { ...type.heading, fontFamily: fonts.bold },
  markTextSelected: { color: colors.surface },
  markTextIdle: { color: colors.brandPressed },
  helper: { color: colors.muted, ...type.bodySmall, marginBottom: spacing.lg, marginTop: spacing.md },
  muteRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: "row",
    minHeight: size.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  muteLabel: { color: colors.ink, ...type.body, flex: 1, fontFamily: fonts.semibold },
  alertsEyebrow: { color: colors.brandPressed, ...type.eyebrow, marginBottom: spacing.sm, marginTop: spacing.xl },
  alerts: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  alertRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: size.primary,
    paddingHorizontal: spacing.lg,
  },
  alertDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  alertLabel: { color: colors.ink, ...type.body, flex: 1 },
  alertDisabled: { color: colors.disabledText },
  switchHit: { alignItems: "center", justifyContent: "center", minHeight: size.hit, minWidth: size.hit },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    zIndex: size.icon.md,
  },
  menuCard: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    boxShadow: elevation.e2,
    padding: spacing.xs,
    width: "100%",
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: size.primary,
    paddingHorizontal: spacing.md,
  },
  menuPressed: { backgroundColor: colors.selection },
  pickRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: size.primary,
    paddingHorizontal: spacing.md,
  },
  menuLabel: { color: colors.ink, ...type.body, fontFamily: fonts.semibold },
  menuDanger: { color: colors.danger, ...type.body, fontFamily: fonts.semibold },
});
