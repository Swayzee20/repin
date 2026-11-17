import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, TextField } from "./components";
import { pressableFocused, webFocusRing } from "./focus-ring";
import { singleFieldReturn } from "./keyboard";
import {
  DANGER_DELETION_LIST,
  DANGER_DISABLED_HELPER,
  DANGER_PREVIEW_FAILED,
  DANGER_PREVIEW_LOADING,
  DANGER_WARNING,
  DELETE_CONFIRMATION,
  HANDOVER_COLLAPSED_COUNT,
  handoverOutcome,
  handoverRowLabel,
  type DeletionPreviewCrew,
} from "./danger-zone-copy";
import { calendar, colors, fonts, radii, size, spacing, type } from "./theme";

export {
  DANGER_DELETION_LIST,
  DANGER_DISABLED_HELPER,
  DANGER_FAILED,
  DANGER_PREVIEW_FAILED,
  DANGER_PREVIEW_LOADING,
  DANGER_WARNING,
  DANGER_WRONG_PASSWORD,
  DELETE_CONFIRMATION,
  HANDOVER_COLLAPSED_COUNT,
  handoverOutcome,
  handoverRowLabel,
  type DeletionPreviewCrew,
} from "./danger-zone-copy";

export function DangerZoneCard({
  confirmation,
  crewsExpanded,
  deleting,
  deleteError,
  onChangeConfirmation,
  onChangePassword,
  onDelete,
  onForgotPassword,
  onRetryPreview,
  onToggleCrews,
  password,
  passwordError,
  preview,
  previewError,
  previewLoading,
}: {
  confirmation: string;
  crewsExpanded: boolean;
  deleting: boolean;
  deleteError: string | null;
  onChangeConfirmation: (value: string) => void;
  onChangePassword: (value: string) => void;
  onDelete: () => void;
  onForgotPassword: () => void;
  onRetryPreview: () => void;
  onToggleCrews: () => void;
  password: string;
  passwordError: string | null;
  preview: DeletionPreviewCrew[] | null;
  previewError: string | null;
  previewLoading: boolean;
}) {
  const confirmed = confirmation.trim() === DELETE_CONFIRMATION;
  const previewReady = preview !== null && !previewError;
  const ownsCrews = (preview?.length ?? 0) > 0;
  const canSubmit = previewReady && confirmed && password.trim().length > 0 && !deleting;
  const disabledReason = previewError
    ? DANGER_PREVIEW_FAILED
    : canSubmit
      ? undefined
      : DANGER_DISABLED_HELPER;
  const helper = passwordError || deleteError;
  const visibleCrews = preview && preview.length > HANDOVER_COLLAPSED_COUNT && !crewsExpanded
    ? preview.slice(0, HANDOVER_COLLAPSED_COUNT)
    : preview;

  return (
    <View>
      <Text accessibilityRole="header" style={styles.heading}>Danger zone</Text>
      <Card style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.warning}>{DANGER_WARNING}</Text>
        <Text style={styles.deletionList}>{DANGER_DELETION_LIST}</Text>
        {ownsCrews ? (
          <View>
            <Text style={styles.handoverHeading}>Crews you own</Text>
            <View accessibilityRole="list">
              {visibleCrews?.map((crew, index) => (
                <View
                  accessibilityLabel={handoverRowLabel(crew)}
                  accessibilityRole="text"
                  key={crew.groupId}
                  style={[styles.handoverRow, index > 0 && styles.handoverDivider]}
                >
                  <Text style={styles.crewName}>{crew.name}</Text>
                  <Text style={styles.outcome}>{handoverOutcome(crew)}</Text>
                </View>
              ))}
            </View>
            {preview && preview.length > HANDOVER_COLLAPSED_COUNT ? (
              <Pressable
                accessibilityRole="button"
                onPress={onToggleCrews}
                style={(state) => [styles.showAll, webFocusRing(pressableFocused(state))]}
              >
                <Text style={styles.showAllLabel}>
                  {crewsExpanded ? "Show less" : `Show all ${preview.length} crews`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : previewLoading ? (
          <View accessibilityLiveRegion="polite">
            <View style={styles.skeleton} />
            <View style={[styles.skeleton, styles.skeletonShort]} />
            <Text style={styles.previewStatus}>{DANGER_PREVIEW_LOADING}</Text>
          </View>
        ) : previewError ? (
          <View>
            <Text accessibilityLiveRegion="polite" style={styles.previewFailed}>{DANGER_PREVIEW_FAILED}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={onRetryPreview}
              style={(state) => [styles.showAll, webFocusRing(pressableFocused(state))]}
            >
              <Text style={styles.showAllLabel}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        <TextField
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          disabled={deleting}
          label="Type DELETE to confirm"
          onChangeText={onChangeConfirmation}
          placeholder="DELETE"
          value={confirmation}
          {...singleFieldReturn("next")}
        />
        <TextField
          autoComplete="password"
          disabled={deleting}
          error={passwordError}
          label="Password"
          onChangeText={onChangePassword}
          placeholder="Enter your password"
          secureTextEntry
          textContentType="password"
          value={password}
          {...singleFieldReturn("done")}
        />
        <Pressable
          accessibilityRole="link"
          disabled={deleting}
          onPress={onForgotPassword}
          style={(state) => [styles.forgot, webFocusRing(pressableFocused(state))]}
        >
          <Text style={[styles.forgotLabel, deleting && styles.forgotLabelDisabled]}>Forgot password?</Text>
        </Pressable>
        {helper && helper !== passwordError ? (
          <Text accessibilityLiveRegion="polite" style={styles.failed}>{helper}</Text>
        ) : null}
        <Button
          disabled={!canSubmit}
          disabledReason={disabledReason}
          loading={deleting}
          loadingLabel="Deleting…"
          onPress={onDelete}
          variant="danger"
        >
          Delete account
        </Button>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.danger, ...type.heading, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.dangerSoft,
    borderWidth: calendar.dayRing,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  warning: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  deletionList: { color: colors.inkSoft, ...type.bodySmall },
  handoverHeading: {
    color: colors.brandPressed,
    fontFamily: fonts.extrabold,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    marginBottom: spacing.sm,
  },
  handoverRow: { justifyContent: "center", minHeight: size.hit, paddingVertical: spacing.sm },
  handoverDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm },
  crewName: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  outcome: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    marginTop: spacing.xs,
  },
  showAll: { alignItems: "flex-start", justifyContent: "center", minHeight: size.hit },
  showAllLabel: {
    color: colors.brand,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  skeleton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: spacing.xl,
    marginBottom: spacing.sm,
  },
  skeletonShort: { width: "60%" },
  previewStatus: { color: colors.muted, ...type.bodySmall },
  previewFailed: { color: colors.danger, ...type.bodySmall },
  forgot: { alignItems: "flex-start", justifyContent: "center", minHeight: size.hit },
  forgotLabel: {
    color: colors.brand,
    fontFamily: fonts.bold,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  forgotLabelDisabled: { color: colors.disabledText },
  failed: { color: colors.danger, ...type.bodySmall },
});
