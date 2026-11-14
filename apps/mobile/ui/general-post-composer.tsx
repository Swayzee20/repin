import type { GroupSummary } from "@repin/types";
import {
  formatCharacterCounter,
  formatPostedTo,
  formatPostToCrews,
  GENERAL_POST_BODY_MAX,
  GENERAL_POST_CREW_MAX,
  GENERAL_POST_PHOTO_MAX,
  generalPostCopy,
  generalPostDisabledReason,
  generalPostPhotoContentTypes,
  shouldShowCharacterCounter,
  type GeneralPostPhotoContentType,
} from "@repin/validation";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { crewPickerViewState } from "../lib/crew-picker-state";
import {
  completeGeneralPostPhoto,
  reserveGeneralPostPhoto,
} from "../lib/general-posts-api";
import { supabase } from "../lib/supabase";
import { Button, LoadingState, StateCard } from "./components";
import { TextArea } from "./form-fields";
import { photoDismissChrome, photoTileChrome } from "./form-field-state";
import { Icon } from "./icons";
import { TwoPane, useLayoutMode } from "./layout";
import { workoutFormTwoPane } from "./layout-math";
import { ListRow, RoundIconButton } from "./primitives";
import { BottomSheet } from "./sheet";
import { colors, fonts, radii, size, spacing, type } from "./theme";

type DraftPhoto = {
  id: string;
  localUri?: string;
  remoteUrl?: string;
  status: "uploading" | "ready" | "failed";
};

export function GeneralPostComposer({
  body,
  destinationLocked = false,
  destinationNames = [],
  error,
  groups,
  groupsError = null,
  groupsLoading = false,
  modeTitle,
  onBodyChange,
  onClose,
  onPhotosChange,
  onPublicationIdChange,
  onRetryGroups,
  onSelectedGroupIdsChange,
  onSubmit,
  photos,
  publicationId,
  selectedGroupIds,
  submitLabel,
  submitting,
}: {
  body: string;
  destinationLocked?: boolean;
  destinationNames?: string[];
  error?: string | null;
  groups: GroupSummary[];
  groupsError?: string | null;
  groupsLoading?: boolean;
  modeTitle: string;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onPhotosChange: (photos: DraftPhoto[]) => void;
  onPublicationIdChange?: (id: string) => void;
  onRetryGroups?: () => void;
  onSelectedGroupIdsChange: (ids: string[]) => void;
  onSubmit: () => void;
  photos: DraftPhoto[];
  publicationId?: string | null;
  selectedGroupIds: string[];
  submitLabel: string;
  submitting: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { mode } = useLayoutMode();
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const twoPane = workoutFormTwoPane({
    frameWidth,
    mode,
    os: Platform.OS,
    windowWidth,
  });
  const uploading = photos.some((photo) => photo.status === "uploading");
  const failedUpload = photos.some((photo) => photo.status === "failed");
  const helper = generalPostDisabledReason({
    body,
    photoCount: photos.filter((photo) => photo.status === "ready").length,
    uploading,
    failedUpload,
  });
  const selectedNames = groups
    .filter((group) => selectedGroupIds.includes(group.id))
    .map((group) => group.name);
  const destinationLabel = destinationLocked
    ? formatPostedTo(destinationNames.length ? destinationNames : selectedNames)
    : formatPostToCrews(selectedNames);

  const photoTray = (
      <PhotoTray
      onChange={onPhotosChange}
      onPublicationIdChange={onPublicationIdChange}
      photos={photos}
      publicationId={publicationId}
    />
  );
  const fields = (
    <>
      <TextArea
        accessibilityLabel={generalPostCopy.composerPlaceholder}
        onChangeText={onBodyChange}
        placeholder={generalPostCopy.composerPlaceholder}
        value={body}
      />
      {shouldShowCharacterCounter(body.length) ? (
        <Text style={[styles.counter, body.length > GENERAL_POST_BODY_MAX && styles.counterOver]}>
          {formatCharacterCounter(body.length)}
        </Text>
      ) : null}
      {twoPane ? null : photoTray}
      {destinationLocked ? (
        <View style={styles.postedTo}>
          <Text style={styles.postedToLabel}>{generalPostCopy.postedTo}</Text>
          <View style={styles.lockedRow}>
            <Text style={styles.lockedValue}>{destinationLabel}</Text>
          </View>
          <Text style={styles.lockedHint}>{generalPostCopy.crewsLocked}</Text>
        </View>
      ) : (
        <ListRow
          label={destinationLabel || generalPostCopy.chooseCrews}
          onPress={() => setPickerOpen(true)}
        />
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setFrameWidth((current) => (current === next ? current : next));
      }}
      style={styles.root}
    >
      <View style={[styles.closeRow, { paddingTop: insets.top + spacing.sm }]}>
        <RoundIconButton accessibilityLabel="Close" kind="close" onPress={onClose} />
        <Text accessibilityRole="header" style={styles.title}>{modeTitle}</Text>
      </View>
      {twoPane ? (
        <TwoPane
          fallback="stack"
          left={(
            <View style={styles.pane}>
              <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
                {fields}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  disabled={Boolean(helper) || submitting}
                  disabledReason={helper ?? undefined}
                  loading={submitting}
                  onPress={onSubmit}
                >
                  {submitLabel}
                </Button>
              </View>
            </View>
          )}
          right={(
            <View style={styles.pane}>
              {pickerOpen && !destinationLocked ? (
                <CrewPickerPane
                  error={groupsError}
                  groups={groups}
                  loading={groupsLoading}
                  onChange={onSelectedGroupIdsChange}
                  onRetry={onRetryGroups}
                  selectedGroupIds={selectedGroupIds}
                />
              ) : (
                <>
                  <Text style={styles.photosHeading}>Photos</Text>
                  <Text style={styles.photosHint}>Up to 6 photos. Wait for every upload to finish before you post.</Text>
                  {photoTray}
                </>
              )}
            </View>
          )}
        />
      ) : (
        <View style={styles.pane}>
          <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
            {fields}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              disabled={Boolean(helper) || submitting}
              disabledReason={helper ?? undefined}
              loading={submitting}
              onPress={onSubmit}
            >
              {submitLabel}
            </Button>
          </View>
        </View>
      )}
      {destinationLocked ? null : (
        <BottomSheet
          onDismiss={() => setPickerOpen(false)}
          title="Post to crews"
          visible={!twoPane && pickerOpen}
        >
          <CrewPickerPane
            error={groupsError}
            groups={groups}
            loading={groupsLoading}
            onChange={onSelectedGroupIdsChange}
            onRetry={onRetryGroups}
            selectedGroupIds={selectedGroupIds}
          />
        </BottomSheet>
      )}
    </KeyboardAvoidingView>
  );
}

function CrewPickerPane({
  error,
  groups,
  loading,
  onChange,
  onRetry,
  selectedGroupIds,
}: {
  error?: string | null;
  groups: GroupSummary[];
  loading: boolean;
  onChange: (ids: string[]) => void;
  onRetry?: () => void;
  selectedGroupIds: string[];
}) {
  const view = crewPickerViewState({
    error,
    groupCount: groups.length,
    loading,
  });
  if (view === "loading") {
    return <LoadingState message={generalPostCopy.pickerLoading} />;
  }
  if (view === "error") {
    return (
      <StateCard
        actionLabel={generalPostCopy.tryAgain}
        message={error ?? ""}
        onAction={onRetry}
        title={generalPostCopy.pickerLoadErrorTitle}
      />
    );
  }
  if (view === "empty") {
    return <Text style={styles.pickerEmpty}>{generalPostCopy.pickerEmpty}</Text>;
  }
  const atLimit = selectedGroupIds.length >= GENERAL_POST_CREW_MAX;
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerIntro}>{generalPostCopy.pickerIntro}</Text>
      {atLimit ? <Text style={styles.limitBanner}>{generalPostCopy.pickerLimit}</Text> : null}
      {groups.map((group) => {
        const selected = selectedGroupIds.includes(group.id);
        const disabled = !selected && atLimit;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            key={group.id}
            onPress={() => {
              onChange(
                selected
                  ? selectedGroupIds.filter((id) => id !== group.id)
                  : [...selectedGroupIds, group.id],
              );
            }}
            style={[
              styles.crewRow,
              selected && styles.crewRowSelected,
              disabled && styles.crewRowDisabled,
            ]}
          >
            <View style={styles.crewMark}>
              <Text style={styles.crewMarkText}>{group.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.crewCopy}>
              <Text style={styles.crewName}>{group.name}</Text>
              <Text style={styles.crewMeta}>{`${group.memberCount} members`}</Text>
            </View>
            {selected ? <Icon color={colors.brand} name="checkmark" size={size.icon.md} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function PhotoTray({
  onChange,
  onPublicationIdChange,
  photos,
  publicationId,
}: {
  onChange: (photos: DraftPhoto[]) => void;
  onPublicationIdChange?: (id: string) => void;
  photos: DraftPhoto[];
  publicationId?: string | null;
}) {
  const pick = async () => {
    if (photos.length >= GENERAL_POST_PHOTO_MAX) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const contentType = normalizeContentType(asset.mimeType);
    if (!contentType) return;
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    const placeholder: DraftPhoto = {
      id: `local-${Date.now()}`,
      localUri: asset.uri,
      status: "uploading",
    };
    onChange([...photos, placeholder]);
    try {
      const reserved = await reserveGeneralPostPhoto({
        accessToken: auth.session.access_token,
        publicationId: publicationId ?? undefined,
        contentType,
        byteSize: asset.fileSize ?? 1,
      });
      onPublicationIdChange?.(reserved.publicationId);
      const file = await fetch(asset.uri);
      const blob = await file.blob();
      const uploaded = await fetch(reserved.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploaded.ok) throw new Error("Upload failed");
      const completed = await completeGeneralPostPhoto({
        accessToken: auth.session.access_token,
        reservationId: reserved.reservationId,
      });
      onChange(
        (photos.concat(placeholder)).map((photo) =>
          photo.id === placeholder.id
            ? {
                id: completed.reservationId,
                localUri: asset.uri,
                status: completed.uploaded ? "ready" : "failed",
              }
            : photo,
        ),
      );
    } catch {
      onChange(
        (photos.concat(placeholder)).map((photo) =>
          photo.id === placeholder.id ? { ...photo, status: "failed" } : photo,
        ),
      );
    }
  };

  return (
    <ScrollView horizontal style={styles.tray}>
      {photos.map((photo, index) => (
        <View key={photo.id} style={styles.thumbWrap}>
          <Pressable
            onLongPress={() => {
              if (index === 0) return;
              const next = [...photos];
              const [moved] = next.splice(index, 1);
              if (!moved) return;
              next.splice(index - 1, 0, moved);
              onChange(next);
            }}
          >
            <Image source={{ uri: photo.localUri ?? photo.remoteUrl }} style={styles.thumb} />
          </Pressable>
          <Pressable
            accessibilityLabel="Remove photo"
            hitSlop={photoDismissChrome.hitSlop}
            onPress={() => onChange(photos.filter((item) => item.id !== photo.id))}
            style={styles.remove}
          >
            <Icon color={photoDismissChrome.iconColor} name="xmark" size={size.icon.sm} />
          </Pressable>
          {photo.status === "failed" ? (
            <Pressable onPress={() => void pick()} style={styles.retry}>
              <Text style={styles.retryLabel}>{generalPostCopy.retry}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {photos.length < GENERAL_POST_PHOTO_MAX ? (
        <Pressable accessibilityLabel={generalPostCopy.addPhoto} onPress={() => void pick()} style={styles.add}>
          <Icon color={colors.muted} name="camera" size={size.icon.md} />
          <Text style={styles.addLabel}>{generalPostCopy.addPhoto}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function normalizeContentType(value: string | undefined | null): GeneralPostPhotoContentType | null {
  if (!value) return "image/jpeg";
  const mapped = value === "image/jpg" ? "image/jpeg" : value;
  return (generalPostPhotoContentTypes as readonly string[]).includes(mapped)
    ? mapped as GeneralPostPhotoContentType
    : null;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  closeRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { color: colors.ink, flex: 1, marginLeft: spacing.md, textAlign: "center", ...type.heading },
  pane: { flex: 1 },
  fields: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  counter: { alignSelf: "flex-end", color: colors.muted, ...type.label, fontFamily: fonts.medium },
  counterOver: { color: colors.danger },
  error: { color: colors.danger, ...type.bodySmall, fontFamily: fonts.semibold },
  postedTo: { gap: spacing.sm },
  postedToLabel: { color: colors.brand, ...type.eyebrow },
  lockedRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: size.hit,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  lockedValue: { color: colors.ink, ...type.body },
  lockedHint: { color: colors.muted, ...type.bodySmall },
  photosHeading: { color: colors.ink, paddingHorizontal: spacing.xl, ...type.heading },
  photosHint: { color: colors.muted, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, ...type.bodySmall },
  tray: { flexGrow: 0, paddingVertical: spacing.md },
  thumbWrap: { marginRight: spacing.sm },
  thumb: { borderRadius: radii.md, height: size.control + size.hit, width: size.control + size.hit },
  remove: {
    alignItems: "center",
    backgroundColor: photoDismissChrome.backgroundColor,
    borderColor: photoDismissChrome.borderColor,
    borderRadius: photoDismissChrome.borderRadius,
    borderWidth: photoDismissChrome.borderWidth,
    height: photoDismissChrome.size,
    justifyContent: "center",
    position: "absolute",
    right: -spacing.xs,
    top: -spacing.xs,
    width: photoDismissChrome.size,
  },
  retry: {
    alignSelf: "center",
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.pill,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  retryLabel: { color: colors.danger, ...type.micro, fontFamily: fonts.semibold },
  add: {
    alignItems: "center",
    borderColor: photoTileChrome.borderColor,
    borderRadius: photoTileChrome.borderRadius,
    borderStyle: photoTileChrome.borderStyle,
    borderWidth: photoTileChrome.borderWidth,
    height: size.control + size.hit,
    justifyContent: "center",
    width: size.control + size.hit,
  },
  addLabel: { color: colors.muted, marginTop: spacing.xs, ...type.micro, fontFamily: fonts.medium },
  picker: { gap: spacing.sm, paddingBottom: spacing.lg },
  pickerIntro: { color: colors.muted, ...type.bodySmall },
  pickerEmpty: { color: colors.muted, ...type.body },
  limitBanner: {
    backgroundColor: colors.brandTint,
    borderRadius: radii.md,
    color: colors.brandPressed,
    padding: spacing.md,
    ...type.bodySmall,
    fontFamily: fonts.semibold,
  },
  crewRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: size.hit,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  crewRowSelected: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  crewRowDisabled: { opacity: 1, backgroundColor: colors.disabledFill },
  crewMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: size.avatars.sm,
    justifyContent: "center",
    width: size.avatars.sm,
  },
  crewMarkText: { color: colors.brand, ...type.label, fontFamily: fonts.bold },
  crewCopy: { flex: 1, marginLeft: spacing.md },
  crewName: { color: colors.ink, ...type.body, fontFamily: fonts.semibold },
  crewMeta: { color: colors.muted, ...type.label },
});
