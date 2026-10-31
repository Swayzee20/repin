import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { WorkoutFeedItem, WorkoutType } from "@repin/types";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, type ComponentRef, type ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";
import { markWorkoutDataStale } from "../../../lib/data-freshness";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { Button, TextField, WorkoutSummaryCard } from "../../../ui/components";
import { Chevron } from "../../../ui/icons";
import { RoundIconButton, roundNavButtonStyle } from "../../../ui/primitives";
import { TwoPane, useLayoutMode, WideColumn } from "../../../ui/layout";
import { ScrollAnchor, ScrollAnchorProvider, useScrollAnchor, writeStoredScrollAnchor } from "../../../ui/scroll-anchor";
import { colors, controls, fonts, radii, spacing, type } from "../../../ui/theme";
import { WorkoutTypeGrid, WorkoutTypeSelector, workoutTypeLabels } from "../../../ui/workout-type-selector";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const effortLabels = ["Light work", "Felt good", "Solid work", "That was rough", "I'm cooked"];
const postAnchorKey = "log-workout-post";
type SelectedPhoto = { base64: string; mimeType: string; uri: string };
type PhotoStatus = "idle" | "picking" | "uploading";

type LogFormState = {
  caption: string;
  effort: number | null;
  error: string | null;
  occurredAt: string;
  photo: SelectedPhoto | null;
  photoStatus: PhotoStatus;
  pickerMode: "date" | "time";
  showPicker: boolean;
  submitting: boolean;
  webDate: string;
  webTime: string;
  workoutType: WorkoutType | null;
};

type LogFormAction =
  | { caption: string; type: "caption" }
  | { effort: number | null; type: "effort" }
  | { error: string | null; type: "error" }
  | { occurredAt: string; type: "occurred" }
  | { photo: SelectedPhoto | null; type: "photo" }
  | { photoStatus: PhotoStatus; type: "photo-status" }
  | { pickerMode?: "date" | "time"; showPicker: boolean; type: "picker" }
  | { error: string; type: "submit-error" }
  | { type: "submit-start" }
  | { type: "type"; workoutType: WorkoutType }
  | { type: "web-date"; webDate: string }
  | { type: "web-time"; webTime: string };

export default function LogWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLayoutMode();
  const layoutPreview = __DEV__ && isLayoutPreview();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [form, dispatch] = useReducer(logFormReducer, layoutPreview, createLogFormState);
  const postAnchor = useScrollAnchor(mode, postAnchorKey);
  const captionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const focusedField = useRef<"caption" | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBlur = useRef(false);
  const modeRef = useRef(mode);
  const twoPane = mode === "twoPane";
  const occurredAt = new Date(form.occurredAt);
  const canSubmit = Boolean(form.workoutType);

  if (modeRef.current !== mode) {
    modeRef.current = mode;
    ignoreBlur.current = true;
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (focusedField.current === "caption") {
      const anchor = { id: "log-caption", offset: 0 };
      postAnchor.anchorRef.current = anchor;
      writeStoredScrollAnchor(postAnchorKey, anchor);
      postAnchor.requestRestore();
    }
  }

  useEffect(() => {
    const focusCaption = () => {
      if (focusedField.current === "caption") captionRef.current?.focus();
    };
    focusCaption();
    const frame = requestAnimationFrame(() => {
      focusCaption();
      requestAnimationFrame(focusCaption);
    });
    const release = setTimeout(() => {
      ignoreBlur.current = false;
    }, 600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(release);
    };
  }, [mode]);

  const pickPhoto = useCallback(async () => {
    dispatch({ error: null, type: "error" });
    dispatch({ photoStatus: "picking", type: "photo-status" });
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        dispatch({ error: "Allow photo library access to attach a workout photo.", type: "error" });
        dispatch({ photoStatus: "idle", type: "photo-status" });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, base64: true, mediaTypes: ["images"], quality: 0.85, selectionLimit: 1 });
      if (result.canceled) {
        dispatch({ photoStatus: "idle", type: "photo-status" });
        return;
      }
      const asset = result.assets[0];
      if (!asset?.base64) {
        dispatch({ error: "That photo could not be read. Try another image.", type: "error" });
        dispatch({ photoStatus: "idle", type: "photo-status" });
        return;
      }
      dispatch({
        photo: { base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", uri: asset.uri },
        type: "photo",
      });
    } catch {
      dispatch({ error: "That photo could not be read. Try another image.", type: "error" });
      dispatch({ photoStatus: "idle", type: "photo-status" });
    }
  }, []);

  const submitWorkout = useCallback(async () => {
    dispatch({ error: null, type: "error" });
    if (!form.workoutType) {
      dispatch({ error: "Choose a workout type.", type: "error" });
      return;
    }
    if (!supabase || !groupId) {
      dispatch({ error: "This workout cannot be submitted from the current screen.", type: "error" });
      return;
    }
    dispatch({ type: "submit-start" });
    let uploadedPhotoPath: string | null = null;
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to log a workout.");
      if (form.photo) {
        const extension = form.photo.mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
        uploadedPhotoPath = `${data.session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("workout-photos").upload(
          uploadedPhotoPath,
          decodeBase64(form.photo.base64),
          { contentType: form.photo.mimeType, upsert: false },
        );
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
      }
      const response = await fetch(`${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: form.workoutType,
          durationMinutes: null,
          effort: form.effort,
          caption: form.caption,
          photoPath: uploadedPhotoPath,
          occurredAt: form.occurredAt,
          metrics: [],
          movements: [],
          notes: form.caption,
          completedAt: form.occurredAt,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json()) as { error?: string; issues?: { message: string; path?: PropertyKey[] }[] };
      if (!response.ok) {
        const validationMessage = body.issues?.map((issue) => `${issue.path?.join(".") || "workout"}: ${issue.message}`).join("; ");
        if (__DEV__ && body.issues?.length) console.warn("Workout validation failed", body.issues);
        throw new Error(validationMessage || body.error || "Workout could not be created.");
      }
      markWorkoutDataStale();
      router.back();
    } catch (submitError) {
      if (uploadedPhotoPath && supabase) await supabase.storage.from("workout-photos").remove([uploadedPhotoPath]);
      dispatch({
        error: submitError instanceof Error ? submitError.message : "Workout could not be created.",
        type: "submit-error",
      });
    }
  }, [form.caption, form.effort, form.occurredAt, form.photo, form.workoutType, groupId, router]);

  const handleNativeDateChange = useCallback((event: DateTimePickerEvent, value?: Date) => {
    if (event.type === "dismissed" || !value) {
      dispatch({ showPicker: false, type: "picker" });
      return;
    }
    dispatch({ occurredAt: value.toISOString(), type: "occurred" });
    if (Platform.OS === "android" && form.pickerMode === "date") {
      dispatch({ pickerMode: "time", showPicker: false, type: "picker" });
      requestAnimationFrame(() => dispatch({ pickerMode: "time", showPicker: true, type: "picker" }));
      return;
    }
    if (Platform.OS === "android") dispatch({ showPicker: false, type: "picker" });
  }, [form.pickerMode]);

  const captionField = (
    <ScrollAnchor id="log-caption">
      <TextField
        accessibilityLabel="Caption"
        containerStyle={styles.controlSpacing}
        maxLength={2_000}
        multiline
        onBlur={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => {
            if (ignoreBlur.current) return;
            if (focusedField.current === "caption") focusedField.current = null;
          }, 200);
        }}
        onChangeText={(caption) => dispatch({ caption, type: "caption" })}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          focusedField.current = "caption";
        }}
        placeholder="Legs felt great today"
        ref={captionRef}
        style={styles.captionInput}
        value={form.caption}
      />
    </ScrollAnchor>
  );

  const photoBlock = (
    <PhotoField
      onChange={() => void pickPhoto()}
      onRemove={() => dispatch({ photo: null, type: "photo" })}
      photo={form.photo}
      status={form.photoStatus}
      tile={twoPane}
    />
  );

  const completed = (
    <CompletedField
      occurredAt={occurredAt}
      onNativeChange={handleNativeDateChange}
      onWebDate={(webDate) => dispatch({ type: "web-date", webDate })}
      onWebTime={(webTime) => dispatch({ type: "web-time", webTime })}
      onWebCommit={() => dispatch({ occurredAt: fromLocalParts(form.webDate, form.webTime, occurredAt).toISOString(), type: "occurred" })}
      pickerMode={form.pickerMode}
      showPicker={form.showPicker}
      togglePicker={(pickerMode) => dispatch({ pickerMode, showPicker: true, type: "picker" })}
      webDate={form.webDate}
      webTime={form.webTime}
      onPickerDone={() => dispatch({ showPicker: false, type: "picker" })}
    />
  );

  const effort = (
    <View style={styles.section}>
      <FieldLabel hierarchy="primary" label="How'd it feel?" optional />
      <View style={styles.effortRow}>{[1, 2, 3, 4, 5].map((level) => (
        <Pressable
          accessibilityLabel={`${level}: ${effortLabels[level - 1]}`}
          accessibilityRole="button"
          key={level}
          onPress={() => dispatch({ effort: form.effort === level ? null : level, type: "effort" })}
          style={[styles.flameButton, (form.effort ?? 0) >= level && styles.flameButtonActive, form.effort === level && styles.flameButtonSelected]}
        >
          <Text style={[styles.flame, (form.effort ?? 0) < level && styles.flameInactive]}>🔥</Text>
        </Pressable>
      ))}</View>
      <Text style={[styles.effortLabel, !form.effort && styles.effortLabelEmpty]}>{form.effort ? effortLabels[form.effort - 1] : "Tap a flame to rate your effort"}</Text>
    </View>
  );

  const preview = (
    <View style={styles.previewBlock}>
      <View style={styles.previewHeading}>
        <Text style={styles.previewEyebrow}>PREVIEW</Text>
        <Text style={styles.previewHint}>how your crew sees it</Text>
      </View>
      <WorkoutSummaryCard style={styles.previewCard} variant="full" workout={previewWorkout(form, layoutPreview ? "Maya L." : "You", groupId ?? "preview")} />
    </View>
  );

  const submit = (
    <Button disabled={!canSubmit} disabledReason={canSubmit ? undefined : "Choose a workout type."} loading={form.submitting} loadingLabel="Logging" onPress={() => void submitWorkout()} style={twoPane ? styles.pinnedSubmit : styles.submitButton}>Log workout</Button>
  );

  const scroll = (children: ReactNode) => (
    <ScrollView
      automaticallyAdjustKeyboardInsets={!twoPane}
      contentContainerStyle={twoPane ? styles.paneScroll : styles.container}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={postAnchor.onContentSizeChange}
      onLayout={postAnchor.onViewportLayout}
      onScroll={postAnchor.onScroll}
      ref={postAnchor.scrollRef}
      scrollEventThrottle={16}
      style={styles.scrollView}
    >
      <View collapsable={false} ref={postAnchor.contentRef}>
        <ScrollAnchorProvider contentRef={postAnchor.contentRef} onItemLayout={postAnchor.onItemLayout} pane={twoPane ? "right" : null}>
          {children}
        </ScrollAnchorProvider>
      </View>
    </ScrollView>
  );

  if (twoPane) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <TwoPane
          keyboardShouldPersistTaps="handled"
          scrollableRight={false}
          left={(
            <View style={styles.paneBody}>
              <RoundIconButton accessibilityLabel="Cancel" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
              <Text style={styles.eyebrow}>QUICK CHECK-IN</Text>
              <Text style={styles.title}>Log a workout</Text>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>What&apos;d you do?</Text>
                <WorkoutTypeGrid onChange={(workoutType) => dispatch({ type: "type", workoutType })} value={form.workoutType} />
              </View>
              {effort}
              <View style={styles.section}>{completed}</View>
            </View>
          )}
          right={(
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
              {scroll(
                <View style={styles.paneBody}>
                  <Text style={styles.subsectionTitle}>Add to your post</Text>
                  {photoBlock}
                  {captionField}
                  {preview}
                  {form.error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{form.error}</Text></View> : null}
                </View>,
              )}
              <View style={[styles.pinnedBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                {submit}
              </View>
            </KeyboardAvoidingView>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
        {scroll(
          <SafeAreaView edges={["left", "right"]}>
            <WideColumn>
              <RoundIconButton accessibilityLabel="Cancel" kind="back" onPress={() => router.back()} style={roundNavButtonStyle} />
              <Text style={styles.eyebrow}>QUICK CHECK-IN</Text>
              <Text style={styles.title}>Log a workout</Text>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>What&apos;d you do?</Text>
                <WorkoutTypeSelector onChange={(workoutType) => dispatch({ type: "type", workoutType })} value={form.workoutType} />
              </View>
              {effort}
              <View style={styles.postSection}>
                <Text style={styles.subsectionTitle}>Add to your post</Text>
                <View style={styles.postField}>
                  <FieldLabel label="Photo" optional />
                  {photoBlock}
                </View>
                <View style={styles.postField}>
                  <FieldLabel label="Caption" optional />
                  {captionField}
                </View>
              </View>
              <View style={styles.section}>{completed}</View>
              {form.error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{form.error}</Text></View> : null}
              {submit}
            </WideColumn>
          </SafeAreaView>,
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PhotoField({
  onChange,
  onRemove,
  photo,
  status,
  tile,
}: {
  onChange: () => void;
  onRemove: () => void;
  photo: SelectedPhoto | null;
  status: PhotoStatus;
  tile: boolean;
}) {
  if (photo) {
    return (
      <View>
        <Image accessibilityLabel="Selected workout" source={{ uri: photo.uri }} style={tile ? styles.photoTileImage : styles.photoPreview} />
        <View style={styles.photoActions}>
          <Pressable accessibilityRole="button" onPress={onChange}><Text style={styles.textAction}>Change</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onRemove}><Text style={styles.removeAction}>Remove</Text></Pressable>
        </View>
      </View>
    );
  }
  const label = status === "picking" ? "Adding photo…" : status === "uploading" ? "Uploading photo…" : "+ Add photo";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={status === "picking"}
      onPress={onChange}
      style={({ pressed }) => [tile ? styles.photoTile : styles.addPhoto, pressed && styles.pressed]}
    >
      <Text style={styles.addPhotoText}>{label}</Text>
    </Pressable>
  );
}

function CompletedField({
  occurredAt,
  onNativeChange,
  onPickerDone,
  onWebCommit,
  onWebDate,
  onWebTime,
  pickerMode,
  showPicker,
  togglePicker,
  webDate,
  webTime,
}: {
  occurredAt: Date;
  onNativeChange: (event: DateTimePickerEvent, value?: Date) => void;
  onPickerDone: () => void;
  onWebCommit: () => void;
  onWebDate: (value: string) => void;
  onWebTime: (value: string) => void;
  pickerMode: "date" | "time";
  showPicker: boolean;
  togglePicker: (mode: "date" | "time") => void;
  webDate: string;
  webTime: string;
}) {
  if (Platform.OS === "web") {
    return (
      <>
        <Text style={styles.sectionTitle}>Completed</Text>
        <View style={styles.webDateRow}>
          <View style={styles.webDateField}><TextField autoCapitalize="none" label="Date" onBlur={onWebCommit} onChangeText={onWebDate} placeholder="YYYY-MM-DD" value={webDate} /></View>
          <View style={styles.webDateField}><TextField autoCapitalize="none" label="Time" onBlur={onWebCommit} onChangeText={onWebTime} placeholder="HH:MM" value={webTime} /></View>
        </View>
      </>
    );
  }
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => togglePicker("date")} style={({ pressed }) => [styles.whenRow, pressed && styles.pressed]}>
        <Text style={styles.whenLabel}>Completed</Text>
        <View style={styles.whenValue}>
          <Text style={styles.whenText}>{formatFriendlyDate(occurredAt)}</Text>
          <View style={styles.whenAction}><Chevron color={colors.brand} /></View>
        </View>
      </Pressable>
      {showPicker ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker mode={Platform.OS === "ios" ? "datetime" : pickerMode} onChange={onNativeChange} value={occurredAt} />
          {Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={onPickerDone}><Text style={styles.pickerDone}>Done</Text></Pressable> : null}
        </View>
      ) : null}
    </>
  );
}

function FieldLabel({ hierarchy = "field", label, optional = false }: { hierarchy?: "field" | "primary"; label: string; optional?: boolean }) {
  return <View style={styles.labelRow}><Text style={hierarchy === "primary" ? styles.sectionTitle : styles.fieldLabel}>{label}</Text>{optional ? <Text style={styles.optional}>Optional</Text> : null}</View>;
}

function createLogFormState(preview: boolean): LogFormState {
  const now = new Date();
  const parts = getLocalDateParts(now);
  return {
    caption: preview ? "Legs felt great today" : "",
    effort: preview ? 4 : null,
    error: null,
    occurredAt: now.toISOString(),
    photo: null,
    photoStatus: "idle",
    pickerMode: "date",
    showPicker: false,
    submitting: false,
    webDate: parts.date,
    webTime: parts.time,
    workoutType: preview ? "run" : null,
  };
}

function logFormReducer(state: LogFormState, action: LogFormAction): LogFormState {
  switch (action.type) {
    case "caption":
      return { ...state, caption: action.caption };
    case "effort":
      return { ...state, effort: action.effort };
    case "error":
      return { ...state, error: action.error };
    case "occurred": {
      const parts = getLocalDateParts(new Date(action.occurredAt));
      return { ...state, occurredAt: action.occurredAt, webDate: parts.date, webTime: parts.time };
    }
    case "photo":
      return { ...state, photo: action.photo, photoStatus: "idle" };
    case "photo-status":
      return { ...state, photoStatus: action.photoStatus };
    case "picker":
      return { ...state, pickerMode: action.pickerMode ?? state.pickerMode, showPicker: action.showPicker };
    case "submit-error":
      return { ...state, error: action.error, photoStatus: "idle", submitting: false };
    case "submit-start":
      return { ...state, error: null, photoStatus: state.photo ? "uploading" : state.photoStatus, submitting: true };
    case "type":
      return { ...state, workoutType: action.workoutType };
    case "web-date":
      return { ...state, webDate: action.webDate };
    case "web-time":
      return { ...state, webTime: action.webTime };
    default:
      return state;
  }
}

function previewWorkout(form: LogFormState, displayName: string, groupId: string): WorkoutFeedItem {
  const label = form.workoutType ? workoutTypeLabels[form.workoutType] : "Workout";
  return {
    caption: form.caption.trim() || null,
    completedAt: form.occurredAt,
    createdAt: form.occurredAt,
    displayName,
    durationMinutes: null,
    effort: form.effort,
    groupId,
    id: "preview",
    name: label,
    notes: form.caption.trim() || null,
    occurredAt: form.occurredAt,
    photoPath: null,
    photoUrl: form.photo?.uri ?? null,
    resultSummary: form.effort ? `Effort ${form.effort} of 5` : null,
    title: label,
    updatedAt: form.occurredAt,
    userId: "me",
    workoutType: form.workoutType ?? "other",
  };
}

function getLocalDateParts(value: Date) {
  const year = String(value.getFullYear()); const month = String(value.getMonth() + 1).padStart(2, "0"); const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0"); const minutes = String(value.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function fromLocalParts(date: string, time: string, fallback: Date) { const next = new Date(`${date}T${time}:00`); return Number.isNaN(next.getTime()) ? fallback : next; }
function formatFriendlyDate(value: Date) {
  const today = new Date(); const date = value.toDateString() === today.toDateString() ? "Today" : value.toLocaleDateString([], { month: "short", day: "numeric", year: value.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return `${date}, ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
function decodeBase64(value: string) { const binary = globalThis.atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardAvoidingView: { flex: 1 },
  scrollView: { flex: 1 },
  container: { padding: spacing.xxl, paddingBottom: 144 },
  paneBody: { paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  paneScroll: { flexGrow: 1, paddingBottom: spacing.lg },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  section: { marginTop: spacing.xxl },
  postSection: { marginTop: spacing.xxxl },
  sectionTitle: { color: colors.ink, ...type.heading },
  subsectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  fieldLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
  optional: { color: colors.muted, ...type.bodySmall },
  controlSpacing: { marginTop: spacing.sm },
  pressed: { opacity: 0.76 },
  effortRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  flameButton: { alignItems: "center", borderColor: "transparent", borderRadius: radii.md, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  flameButtonActive: { backgroundColor: colors.surfaceMuted },
  flameButtonSelected: { borderColor: colors.brand },
  flame: { fontSize: 25 },
  flameInactive: { opacity: 0.18 },
  effortLabel: { color: colors.inkSoft, ...type.bodySmall, marginTop: spacing.xs },
  effortLabelEmpty: { color: colors.muted },
  captionInput: { maxHeight: 144, minHeight: 88, textAlignVertical: "top" },
  postField: { marginTop: spacing.md },
  addPhoto: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, justifyContent: "center", marginTop: spacing.sm, minHeight: 44, paddingHorizontal: spacing.lg },
  photoTile: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, justifyContent: "center", marginTop: spacing.md, minHeight: spacing.huge * 3, paddingHorizontal: spacing.lg },
  addPhotoText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14 },
  photoPreview: { borderRadius: radii.md, height: 132, marginTop: spacing.sm, width: 176 },
  photoTileImage: { borderRadius: radii.md, height: spacing.huge * 3, marginTop: spacing.md, width: "100%" },
  photoActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  textAction: { color: colors.brand, ...type.label },
  removeAction: { color: colors.muted, ...type.label },
  whenRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52 },
  whenLabel: { color: colors.ink, ...type.heading },
  whenValue: { alignItems: "center", flexDirection: "row", flexShrink: 1, marginLeft: spacing.md },
  whenText: { color: colors.muted, ...type.bodySmall },
  whenAction: { marginLeft: spacing.sm },
  pickerWrap: { alignItems: "flex-end", marginTop: spacing.sm },
  pickerDone: { color: colors.brand, ...type.label, padding: spacing.md },
  webDateRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  webDateField: { flex: 1 },
  previewBlock: { marginTop: spacing.xxl },
  previewHeading: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
  previewEyebrow: { color: colors.brand, ...type.eyebrow },
  previewHint: { color: colors.muted, ...type.bodySmall },
  previewCard: { marginTop: spacing.md },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, marginTop: spacing.xl, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
  submitButton: { marginTop: spacing.xl },
  pinnedBar: { paddingTop: spacing.md },
  pinnedSubmit: { minHeight: controls.buttonHeight },
});
