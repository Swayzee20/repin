import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { RunWorkoutSubtype, WorkoutType } from "@repin/types";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../../lib/supabase";
import { markWorkoutDataStale } from "../../../lib/data-freshness";
import {
  buildIntervalSegments,
  createEmptyInterval,
  getIntervalValidationIssue,
  type IntervalDraft,
  type IntervalValidationIssue,
  validateIntervals,
} from "../../../lib/detailed-run-results";
import { BackButton, Button, TextField } from "../../../ui/components";
import {
  buildDetailedMovements,
  DetailedExerciseFields,
  type DetailedExerciseDraft,
  validateDetailedExercises,
} from "../../../ui/detailed-workout-exercises";
import {
  RunResultEditor,
  RunSubtypeSelector,
} from "../../../ui/detailed-run-fields";
import {
  buildQuickLogResults,
  emptyQuickLogResults,
  type QuickLogResultsDraft,
  validateQuickLogResults,
  WorkoutMetricFields,
} from "../../../ui/quick-log-results";
import { colors, fonts, radii, spacing, type } from "../../../ui/theme";
import { WorkoutTypeSelector, workoutTypeLabels } from "../../../ui/workout-type-selector";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const effortLabels = ["Light work", "Felt good", "Solid work", "That was rough", "I'm cooked"];

type SelectedPhoto = { base64: string; mimeType: string; uri: string };

export default function DetailedWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(null);
  const [runSubtype, setRunSubtype] = useState<RunWorkoutSubtype | null>(null);
  const [results, setResults] = useState<QuickLogResultsDraft>(emptyQuickLogResults);
  const [intervals, setIntervals] = useState<IntervalDraft[]>(() => [createEmptyInterval()]);
  const [runResultsExpanded, setRunResultsExpanded] = useState(true);
  const [runResultError, setRunResultError] = useState<IntervalValidationIssue | { message: string } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const workoutCardY = useRef(0);
  const runEditorY = useRef(0);
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<DetailedExerciseDraft[]>([]);
  const [effort, setEffort] = useState<number | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [webDate, setWebDate] = useState(() => getLocalDateParts(new Date()).date);
  const [webTime, setWebTime] = useState(() => getLocalDateParts(new Date()).time);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [showPicker, setShowPicker] = useState(false);
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStrengthWorkout = workoutType === "strength_training" || workoutType === "powerlifting";

  const handleWorkoutTypeChange = useCallback((nextWorkoutType: WorkoutType) => {
    setWorkoutType(nextWorkoutType);
    if (nextWorkoutType !== "run") {
      setRunSubtype(null);
      setIntervals([createEmptyInterval()]);
      setRunResultsExpanded(true);
      setRunResultError(null);
    }
  }, []);

  const handleRunSubtypeChange = useCallback((nextSubtype: RunWorkoutSubtype) => {
    setError(null);
    setRunResultError(null);
    setRunResultsExpanded(true);
    setRunSubtype((previousSubtype) => {
      if (nextSubtype === "interval" && previousSubtype !== "interval") {
        setResults(emptyQuickLogResults);
        setIntervals([createEmptyInterval()]);
      } else if (previousSubtype === "interval" && nextSubtype !== "interval") {
        setIntervals([createEmptyInterval()]);
      }
      return nextSubtype;
    });
  }, []);

  const handleRunResultsDone = useCallback(() => {
    if (!runSubtype) return;
    const intervalIssue = runSubtype === "interval" ? getIntervalValidationIssue(intervals) : null;
    const issue = intervalIssue?.message ?? (runSubtype === "interval" ? null : validateQuickLogResults(results, "run"));
    if (issue) {
      setRunResultError(intervalIssue ?? { message: issue });
      requestAnimationFrame(() => scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, runEditorY.current - spacing.lg) }));
      return;
    }
    setError(null);
    setRunResultError(null);
    setRunResultsExpanded(false);
  }, [intervals, results, runSubtype]);

  const pickPhoto = useCallback(async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to attach a workout photo.");
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
    setPhoto({ base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", uri: asset.uri });
  }, []);

  const submitWorkout = useCallback(async () => {
    setError(null);
    if (!workoutType) {
      setError("Choose a workout type.");
      return;
    }
    if (workoutType === "run" && !runSubtype) {
      setError("Choose a Run type.");
      return;
    }
    const resultsIssue = workoutType === "run" && runSubtype === "interval"
      ? validateIntervals(intervals)
      : validateQuickLogResults(results, workoutType);
    if (resultsIssue) {
      if (workoutType === "run") {
        setRunResultError(runSubtype === "interval" ? getIntervalValidationIssue(intervals) : { message: resultsIssue });
        setRunResultsExpanded(true);
        requestAnimationFrame(() => scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, runEditorY.current - spacing.lg) }));
      } else {
        setError(resultsIssue);
      }
      return;
    }
    if (isStrengthWorkout) {
      const exerciseIssue = validateDetailedExercises(exercises);
      if (exerciseIssue) {
        setError(exerciseIssue);
        return;
      }
    }
    if (!supabase || !groupId) {
      setError("This workout cannot be submitted from the current screen.");
      return;
    }

    setSubmitting(true);
    let uploadedPhotoPath: string | null = null;
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to log a workout.");
      if (photo) {
        const extension = photo.mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
        uploadedPhotoPath = `${data.session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("workout-photos").upload(
          uploadedPhotoPath,
          decodeBase64(photo.base64),
          { contentType: photo.mimeType, upsert: false },
        );
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
      }

      const isIntervalRun = workoutType === "run" && runSubtype === "interval";
      const structuredResults = isIntervalRun
        ? { durationSeconds: null, metrics: [] }
        : buildQuickLogResults(results, workoutType);
      const segments = isIntervalRun ? buildIntervalSegments(intervals) : [];
      const durationMinutes = structuredResults.durationSeconds == null
        ? null
        : Math.max(1, Math.round(structuredResults.durationSeconds / 60));

      const response = await fetch(`${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workoutType,
          workoutSubtype: workoutType === "run" ? runSubtype : null,
          name,
          durationMinutes,
          effort,
          caption,
          photoPath: uploadedPhotoPath,
          occurredAt: occurredAt.toISOString(),
          metrics: structuredResults.metrics,
          movements: isStrengthWorkout ? buildDetailedMovements(exercises) : [],
          segments,
          title: name.trim() || workoutTypeLabels[workoutType],
          notes: caption,
          completedAt: occurredAt.toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json()) as {
        error?: string;
        issues?: { message: string; path?: PropertyKey[] }[];
      };
      if (!response.ok) {
        const validationMessage = body.issues
          ?.map((issue) => `${issue.path?.join(".") || "workout"}: ${issue.message}`)
          .join("; ");
        if (__DEV__ && body.issues?.length) console.warn("Detailed workout validation failed", body.issues);
        throw new Error(validationMessage || body.error || "Workout could not be created.");
      }
      markWorkoutDataStale();
      router.back();
    } catch (submitError) {
      if (uploadedPhotoPath && supabase) {
        await supabase.storage.from("workout-photos").remove([uploadedPhotoPath]);
      }
      setError(submitError instanceof Error ? submitError.message : "Workout could not be created.");
      setSubmitting(false);
    }
  }, [caption, effort, exercises, groupId, intervals, isStrengthWorkout, name, occurredAt, photo, results, router, runSubtype, workoutType]);

  const handleNativeDateChange = useCallback((event: DateTimePickerEvent, value?: Date) => {
    if (event.type === "dismissed" || !value) {
      setShowPicker(false);
      return;
    }
    setOccurredAt(value);
    if (Platform.OS === "android" && pickerMode === "date") {
      setShowPicker(false);
      setPickerMode("time");
      requestAnimationFrame(() => setShowPicker(true));
      return;
    }
    if (Platform.OS === "android") setShowPicker(false);
  }, [pickerMode]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
        <View style={styles.header}>
          <BackButton label="Cancel" onPress={() => router.back()} />
          <Text style={styles.eyebrow}>DETAILED WORKOUT</Text>
          <Text style={styles.title}>Track your workout</Text>
        </View>
        <View style={styles.headerDivider} />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.container}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.scrollView}
        >
          <View onLayout={(event) => { workoutCardY.current = event.nativeEvent.layout.y; }} style={styles.formCard}>
            <Text style={styles.sectionTitle}>What&apos;d you do?</Text>
            <WorkoutTypeSelector compact onChange={handleWorkoutTypeChange} value={workoutType} />

            {workoutType === "run" ? <RunSubtypeSelector onChange={handleRunSubtypeChange} value={runSubtype} /> : null}

            {workoutType === "run" && runSubtype ? (
              <View onLayout={(event) => { runEditorY.current = workoutCardY.current + event.nativeEvent.layout.y; }}>
                <RunResultEditor
                  expanded={runResultsExpanded}
                  intervals={intervals}
                  onDone={handleRunResultsDone}
                  onEdit={() => {
                    setError(null);
                    setRunResultError(null);
                    setRunResultsExpanded(true);
                  }}
                  onIntervalsChange={(nextIntervals) => {
                    setRunResultError(null);
                    setIntervals(nextIntervals);
                  }}
                  onResultsChange={(nextResults) => {
                    setRunResultError(null);
                    setResults(nextResults);
                  }}
                  results={results}
                  subtype={runSubtype}
                  validationError={runResultError}
                />
              </View>
            ) : (
              <WorkoutMetricFields
                onChange={setResults}
                value={results}
                workoutType={workoutType === "run" && !runSubtype ? null : workoutType}
              />
            )}

            {isStrengthWorkout ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                <DetailedExerciseFields exercises={exercises} onChange={setExercises} />
              </View>
            ) : null}

            <View style={styles.secondarySection}>
              <FieldLabel label="Workout name" optional />
              <TextField compact containerStyle={styles.controlSpacing} maxLength={120} onChangeText={setName} placeholder="Push day, Murph, morning run..." returnKeyType="next" value={name} />
            </View>
          </View>

          <View style={styles.formCard}>
            <FieldLabel hierarchy="primary" label="How'd it feel?" optional />
            <View style={styles.effortRow}>
              {[1, 2, 3, 4, 5].map((level) => (
                <Pressable
                  accessibilityLabel={`${level}: ${effortLabels[level - 1]}`}
                  accessibilityRole="button"
                  key={level}
                  onPress={() => setEffort(effort === level ? null : level)}
                  style={[styles.flameButton, (effort ?? 0) >= level && styles.flameButtonActive, effort === level && styles.flameButtonSelected]}
                >
                  <Text style={[styles.flame, (effort ?? 0) < level && styles.flameInactive]}>🔥</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.effortLabel, !effort && styles.effortLabelEmpty]}>{effort ? effortLabels[effort - 1] : "Tap a flame to rate your effort"}</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.subsectionTitle}>Add to your post</Text>
            <View style={styles.postField}>
              <FieldLabel label="Photo" optional />
              {photo ? (
                <View>
                  <Image accessibilityLabel="Selected workout" source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <View style={styles.photoActions}><Pressable accessibilityRole="button" onPress={() => void pickPhoto()}><Text style={styles.textAction}>Change</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPhoto(null)}><Text style={styles.removeAction}>Remove</Text></Pressable></View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => void pickPhoto()} style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}><Text style={styles.addPhotoText}>+ Add photo</Text></Pressable>
              )}
            </View>
            <View style={styles.postField}>
              <FieldLabel label="Caption" optional />
              <TextField containerStyle={styles.controlSpacing} maxLength={2_000} multiline onChangeText={setCaption} placeholder="Legs felt great today" style={styles.captionInput} value={caption} />
            </View>
          </View>

          <View style={[styles.formCard, styles.completedCard]}>
            {Platform.OS === "web" ? (
              <>
                <Text style={styles.sectionTitle}>Completed</Text>
                <View style={styles.webDateRow}>
                  <View style={styles.webDateField}><TextField compact autoCapitalize="none" label="Date" onBlur={() => setOccurredAt(fromLocalParts(webDate, webTime, occurredAt))} onChangeText={setWebDate} placeholder="YYYY-MM-DD" value={webDate} /></View>
                  <View style={styles.webDateField}><TextField compact autoCapitalize="none" label="Time" onBlur={() => setOccurredAt(fromLocalParts(webDate, webTime, occurredAt))} onChangeText={setWebTime} placeholder="HH:MM" value={webTime} /></View>
                </View>
              </>
            ) : (
              <>
                <Pressable accessibilityRole="button" onPress={() => { setPickerMode("date"); setShowPicker(true); }} style={({ pressed }) => [styles.whenRow, pressed && styles.pressed]}>
                  <Text style={styles.whenLabel}>Completed</Text>
                  <View style={styles.whenValue}><Text style={styles.whenText}>{formatFriendlyDate(occurredAt)}</Text><Text style={styles.whenAction}>›</Text></View>
                </Pressable>
                {showPicker ? <View style={styles.pickerWrap}><DateTimePicker mode={Platform.OS === "ios" ? "datetime" : pickerMode} onChange={handleNativeDateChange} value={occurredAt} />{Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => setShowPicker(false)}><Text style={styles.pickerDone}>Done</Text></Pressable> : null}</View> : null}
              </>
            )}
          </View>

          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
          <Button disabled={!workoutType || (workoutType === "run" && !runSubtype)} loading={submitting} onPress={() => void submitWorkout()} style={styles.submitButton}>Log workout</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({
  hierarchy = "field",
  label,
  optional = false,
}: {
  hierarchy?: "field" | "primary";
  label: string;
  optional?: boolean;
}) {
  return <View style={styles.labelRow}><Text style={hierarchy === "primary" ? styles.sectionTitle : styles.fieldLabel}>{label}</Text>{optional ? <Text style={styles.optional}>Optional</Text> : null}</View>;
}

function getLocalDateParts(value: Date) {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function fromLocalParts(date: string, time: string, fallback: Date) {
  const next = new Date(`${date}T${time}:00`);
  return Number.isNaN(next.getTime()) ? fallback : next;
}

function formatFriendlyDate(value: Date) {
  const today = new Date();
  const date = value.toDateString() === today.toDateString()
    ? "Today"
    : value.toLocaleDateString([], { month: "short", day: "numeric", year: value.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return `${date}, ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardAvoidingView: { backgroundColor: colors.surfaceMuted, flex: 1 },
  header: { backgroundColor: colors.surface, paddingBottom: spacing.xxl, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl },
  headerDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  scrollView: { backgroundColor: colors.surfaceMuted, flex: 1 },
  container: { paddingBottom: 144, paddingHorizontal: spacing.md, paddingTop: spacing.xxl },
  formCard: { backgroundColor: colors.surface, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.xxl },
  completedCard: { paddingVertical: spacing.lg },
  eyebrow: { color: colors.brand, ...type.eyebrow },
  title: { color: colors.ink, ...type.display, marginTop: spacing.xs },
  section: { marginTop: spacing.xxl },
  secondarySection: { marginTop: spacing.lg },
  sectionTitle: { color: colors.ink, ...type.heading },
  subsectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  fieldLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.xs },
  optional: { color: colors.subtle, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  controlSpacing: { marginTop: spacing.xs },
  effortRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  flameButton: { alignItems: "center", borderColor: "transparent", borderRadius: radii.md, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  flameButtonActive: { backgroundColor: colors.brandSoft },
  flameButtonSelected: { borderColor: colors.brand },
  flame: { fontSize: 25 },
  flameInactive: { opacity: 0.18 },
  effortLabel: { color: colors.inkSoft, ...type.bodySmall, marginTop: spacing.sm },
  effortLabelEmpty: { color: colors.muted },
  webDateRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  webDateField: { flex: 1 },
  whenRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 48 },
  whenLabel: { color: colors.ink, ...type.heading },
  whenValue: { alignItems: "center", flexDirection: "row", flexShrink: 1, marginLeft: spacing.md },
  whenText: { color: colors.muted, ...type.bodySmall },
  whenAction: { color: colors.brand, fontFamily: fonts.medium, fontSize: 24, marginLeft: spacing.sm },
  pickerWrap: { alignItems: "flex-end", marginTop: spacing.sm },
  pickerDone: { color: colors.brand, ...type.label, padding: spacing.md },
  postField: { marginTop: spacing.md },
  addPhoto: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, justifyContent: "center", marginTop: spacing.sm, minHeight: 44, paddingHorizontal: spacing.lg },
  addPhotoText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14 },
  photoPreview: { borderRadius: radii.md, height: 132, marginTop: spacing.sm, width: 176 },
  photoActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  textAction: { color: colors.brand, ...type.label },
  removeAction: { color: colors.muted, ...type.label },
  captionInput: { maxHeight: 144, minHeight: 88, textAlignVertical: "top" },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, marginTop: spacing.xl, padding: spacing.md },
  errorText: { color: colors.danger, ...type.bodySmall },
  submitButton: { marginTop: spacing.xl },
  pressed: { opacity: 0.76 },
});
