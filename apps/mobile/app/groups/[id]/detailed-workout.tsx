import type { CommunityWorkoutDetail, RunWorkoutSubtype, WorkoutFeedItem, WorkoutType } from "@repin/types";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, View, type ScrollViewInstance, type TextInput } from "react-native";

import { supabase } from "../../../lib/supabase";
import { markWorkoutDataStale } from "../../../lib/data-freshness";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { clearWorkoutDetailCaches } from "../../../lib/workout-detail-cache";
import {
  buildIntervalSegments,
  buildRunResultSummary,
  createEmptyInterval,
  getIntervalValidationIssue,
  hydrateIntervalDrafts,
  type IntervalDraft,
  type IntervalValidationIssue,
  validateIntervals,
} from "../../../lib/detailed-run-results";
import { Button, WorkoutSummaryCard } from "../../../ui/components";
import { FieldLabel, FlameRating, PhotoTile, TextArea, TextField, photoUploadFieldError } from "../../../ui/form-fields";
import {
  buildDetailedMovements,
  DetailedExerciseFields,
  LastTimeUndoToast,
  hydrateDetailedExercises,
  hydrateWorkoutLoadUnitFromMovements,
  previewStrengthSummary,
  readStoredLoadUnit,
  type DetailedExerciseDraft,
  type LoadUnit,
  type UseUndoToast,
  validateDetailedExercises,
  writeStoredLoadUnit,
} from "../../../ui/detailed-workout-exercises";
import {
  FunctionalFormatSetup,
  FunctionalScoreFields,
  FunctionalWorkoutFields,
} from "../../../ui/functional-format-fields";
import {
  buildFfMovements,
  buildFunctionalFormat,
  emptyFunctionalFormat,
  functionalFormatDisabledReason,
  hydrateFfExercises,
  hydrateFunctionalFormat,
  previewFunctionalFormatSummary,
  validateFunctionalFormat,
  type FfExerciseDraft,
  type FunctionalFormatDraft,
} from "../../../ui/functional-format-state";
import {
  RunResultEditor,
  RunSubtypeSelector,
} from "../../../ui/detailed-run-fields";
import { attachLogVersion, previewDistanceDurationSummary, usesMetricFields } from "../../../ui/logging-form-state";
import {
  buildQuickLogResults,
  emptyQuickLogResults,
  hydrateQuickLogResults,
  type QuickLogResultsDraft,
  validateQuickLogResults,
  WorkoutMetricFields,
} from "../../../ui/quick-log-results";
import { fieldChainProps } from "../../../ui/keyboard";
import { spacing } from "../../../ui/theme";
import {
  CardHeading,
  CompletedCard,
  FormCard,
  FormError,
  WorkoutFormScaffold,
  getLocalDateParts,
} from "../../../ui/workout-form-frame";
import { WorkoutTypeSelector, workoutTypeLabels } from "../../../ui/workout-type-selector";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const runPreviewTitles: Record<RunWorkoutSubtype, string> = {
  distance: "Distance run",
  interval: "Interval run",
  tempo: "Tempo run",
};

type SelectedPhoto = { base64: string; mimeType: string; uri: string };

export default function DetailedWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; sessionId?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const editSessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const editing = Boolean(editSessionId);
  const layoutPreview = __DEV__ && isLayoutPreview() && !editing;
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(layoutPreview ? "run" : null);
  const [runSubtype, setRunSubtype] = useState<RunWorkoutSubtype | null>(layoutPreview ? "tempo" : null);
  const [results, setResults] = useState<QuickLogResultsDraft>(layoutPreview ? { ...emptyQuickLogResults, distance: "3.2", timeMinutes: "28", timeSeconds: "14" } : emptyQuickLogResults);
  const [intervals, setIntervals] = useState<IntervalDraft[]>(() => [createEmptyInterval()]);
  const [runResultsExpanded, setRunResultsExpanded] = useState(true);
  const [runResultError, setRunResultError] = useState<IntervalValidationIssue | { message: string } | null>(null);
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const captionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const workoutCardY = useRef(0);
  const runEditorY = useRef(0);
  const [name, setName] = useState(layoutPreview ? "Saturday tempo" : "");
  const [exercises, setExercises] = useState<DetailedExerciseDraft[]>([]);
  const [ffExercises, setFfExercises] = useState<FfExerciseDraft[]>([]);
  const [ffFormat, setFfFormat] = useState<FunctionalFormatDraft>(emptyFunctionalFormat);
  const [loadUnit, setLoadUnit] = useState<LoadUnit>(() => readStoredLoadUnit());
  const [useUndo, setUseUndo] = useState<UseUndoToast | null>(null);
  const [effort, setEffort] = useState<number | null>(layoutPreview ? 3 : null);
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [webDate, setWebDate] = useState(() => getLocalDateParts(new Date()).date);
  const [webTime, setWebTime] = useState(() => getLocalDateParts(new Date()).time);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [showPicker, setShowPicker] = useState(false);
  const [caption, setCaption] = useState(layoutPreview ? "Legs felt great today" : "");
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editSessionId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStrengthWorkout = workoutType === "strength_training" || workoutType === "powerlifting";
  const isFunctionalFitness = workoutType === "functional_fitness";
  const ffFormatted = isFunctionalFitness && Boolean(ffFormat.type);
  const photoError = photoUploadFieldError(error);

  useEffect(() => {
    if (!editSessionId || !groupId || !supabase) return;
    let active = true;
    void supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      try {
        if (sessionError || !data.session) throw new Error("Sign in to edit this workout.");
        const response = await fetch(`${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(editSessionId)}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: AbortSignal.timeout(7_500),
        });
        const body = (await response.json()) as { error?: string; workout?: CommunityWorkoutDetail };
        if (!response.ok || !body.workout) throw new Error(body.error ?? "Workout could not be loaded.");
        if (!active) return;
        const workout = body.workout;
        const nextOccurredAt = new Date(workout.occurredAt ?? workout.completedAt ?? "");
        setWorkoutType(workout.workoutType as WorkoutType);
        setRunSubtype(workout.workoutSubtype);
        setResults(hydrateQuickLogResults(workout.metrics));
        setIntervals(hydrateIntervalDrafts(workout.segments));
        setFfFormat(hydrateFunctionalFormat(workout.format));
        if (workout.format) {
          setFfExercises(hydrateFfExercises(workout.movements));
          setExercises([]);
        } else {
          setFfExercises([]);
          setExercises(hydrateDetailedExercises(workout.movements));
        }
        setLoadUnit(hydrateWorkoutLoadUnitFromMovements(workout.movements, readStoredLoadUnit()));
        setName(workout.name ?? "");
        setEffort(workout.effort);
        if (!Number.isNaN(nextOccurredAt.getTime())) {
          const parts = getLocalDateParts(nextOccurredAt);
          setOccurredAt(nextOccurredAt);
          setWebDate(parts.date);
          setWebTime(parts.time);
        }
        setCaption(workout.caption ?? "");
        setExistingPhotoPath(workout.photoPath);
        setExistingPhotoUrl(workout.photoUrl ?? null);
        setRunResultsExpanded(false);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Workout could not be loaded.");
      } finally {
        if (active) setLoadingExisting(false);
      }
    });
    return () => { active = false; };
  }, [editSessionId, groupId]);

  const handleWorkoutTypeChange = useCallback((nextWorkoutType: WorkoutType) => {
    setWorkoutType(nextWorkoutType);
    if (nextWorkoutType !== "run") {
      setRunSubtype(null);
      setIntervals([createEmptyInterval()]);
      setRunResultsExpanded(true);
      setRunResultError(null);
    }
    if (nextWorkoutType !== "functional_fitness") {
      setFfFormat(emptyFunctionalFormat);
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
      requestAnimationFrame(() => scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, workoutCardY.current + runEditorY.current - spacing.lg) }));
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
    setPhotoRemoved(false);
    setPhoto({ base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", uri: asset.uri });
  }, []);

  const submitWorkout = useCallback(async () => {
    setError(null);
    if (!workoutType) {
      setError("Choose a workout type.");
      return;
    }
    if (workoutType === "run" && !runSubtype && !editing) {
      setError("Choose a Run type.");
      return;
    }
    const resultsIssue = workoutType === "run" && runSubtype === "interval"
      ? validateIntervals(intervals)
      : ffFormatted
        ? validateFunctionalFormat(ffFormat, ffExercises)
        : isFunctionalFitness && !ffFormat.type && !editing
          ? "Choose a format."
          : validateQuickLogResults(results, workoutType);
    if (resultsIssue) {
      if (workoutType === "run") {
        setRunResultError(runSubtype === "interval" ? getIntervalValidationIssue(intervals) : { message: resultsIssue });
        setRunResultsExpanded(true);
        requestAnimationFrame(() => scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, workoutCardY.current + runEditorY.current - spacing.lg) }));
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
      const format = ffFormatted ? buildFunctionalFormat(ffFormat) : null;
      const structuredResults = isIntervalRun || ffFormatted
        ? { durationSeconds: null, metrics: [] }
        : buildQuickLogResults(results, workoutType);
      const segments = isIntervalRun ? buildIntervalSegments(intervals) : [];
      const durationMinutes = structuredResults.durationSeconds == null
        ? null
        : Math.max(1, Math.round(structuredResults.durationSeconds / 60));

      const endpoint = editSessionId
        ? `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts/${encodeURIComponent(editSessionId)}`
        : `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts`;
      const nextPhotoPath = uploadedPhotoPath ?? (photoRemoved ? null : existingPhotoPath);
      const response = await fetch(endpoint, {
        method: editSessionId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attachLogVersion({
          workoutType,
          workoutSubtype: workoutType === "run" ? runSubtype : null,
          name,
          durationMinutes,
          effort,
          caption,
          photoPath: nextPhotoPath,
          occurredAt: occurredAt.toISOString(),
          format,
          metrics: structuredResults.metrics,
          movements: isStrengthWorkout
            ? buildDetailedMovements(exercises, loadUnit)
            : ffFormatted
              ? buildFfMovements(ffExercises, loadUnit)
              : [],
          segments,
          title: name.trim() || workoutTypeLabels[workoutType],
          notes: caption,
          completedAt: occurredAt.toISOString(),
        })),
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
      if (editSessionId && existingPhotoPath && existingPhotoPath !== nextPhotoPath) {
        await supabase.storage.from("workout-photos").remove([existingPhotoPath]);
      }
      markWorkoutDataStale();
      clearWorkoutDetailCaches();
      if (isStrengthWorkout || ffFormatted) writeStoredLoadUnit(loadUnit);
      router.back();
    } catch (submitError) {
      if (uploadedPhotoPath && supabase) {
        await supabase.storage.from("workout-photos").remove([uploadedPhotoPath]);
      }
      setError(submitError instanceof Error ? submitError.message : "Workout could not be created.");
      setSubmitting(false);
    }
  }, [caption, editSessionId, editing, effort, exercises, existingPhotoPath, ffExercises, ffFormat, ffFormatted, groupId, intervals, isFunctionalFitness, isStrengthWorkout, loadUnit, name, occurredAt, photo, photoRemoved, results, router, runSubtype, workoutType]);

  const showsMetrics = usesMetricFields(workoutType)
    && (workoutType !== "functional_fitness" || (!ffFormat.type && editing));
  const disabledReason = !workoutType
    ? "Choose a workout type."
    : !editing && workoutType === "run" && !runSubtype
      ? "Choose a run type."
      : isFunctionalFitness
        ? functionalFormatDisabledReason(ffFormat, ffExercises, editing)
        : undefined;
  const photoUri = photo?.uri ?? (existingPhotoUrl && !photoRemoved ? existingPhotoUrl : null);

  return (
    <WorkoutFormScaffold
      eyebrow={editing ? "EDIT WORKOUT" : "DETAILED WORKOUT"}
      fields={(
        <>
          <FormCard>
            <CardHeading>What&apos;d you do?</CardHeading>
            <WorkoutTypeSelector onChange={handleWorkoutTypeChange} value={workoutType} />
            {isFunctionalFitness ? (
              <FunctionalFormatSetup draft={ffFormat} onChange={setFfFormat} />
            ) : null}
          </FormCard>
          {workoutType === "run" ? (
            <View onLayout={(event) => { workoutCardY.current = event.nativeEvent.layout.y; }}>
              <FormCard>
                <RunSubtypeSelector onChange={handleRunSubtypeChange} value={runSubtype} />
                {runSubtype ? (
                  <View onLayout={(event) => { runEditorY.current = event.nativeEvent.layout.y; }}>
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
                ) : null}
              </FormCard>
            </View>
          ) : null}
          {showsMetrics ? (
            <FormCard>
              <WorkoutMetricFields
                onChange={setResults}
                value={results}
                workoutType={workoutType}
              />
            </FormCard>
          ) : null}
          {isStrengthWorkout ? (
            <FormCard>
              <DetailedExerciseFields
                excludeSessionId={editSessionId}
                exercises={exercises}
                loadUnit={loadUnit}
                onAfterLast={() => nameRef.current?.focus()}
                onChange={(next) => {
                  setExercises(next);
                }}
                onLoadUnitChange={(unit) => {
                  setLoadUnit(unit);
                  writeStoredLoadUnit(unit);
                }}
                onUseUndo={setUseUndo}
              />
            </FormCard>
          ) : null}
          {ffFormatted && ffFormat.type ? (
            <FormCard>
              <FunctionalWorkoutFields
                exercises={ffExercises}
                formatType={ffFormat.type}
                intervalMinutes={ffFormat.intervalMinutes}
                loadUnit={loadUnit}
                onAfterLast={() => nameRef.current?.focus()}
                onChange={setFfExercises}
                onLoadUnitChange={(unit) => {
                  setLoadUnit(unit);
                  writeStoredLoadUnit(unit);
                }}
              />
            </FormCard>
          ) : null}
          {ffFormatted && ffFormat.type && ffFormat.type !== "emom" ? (
            <FormCard>
              <FunctionalScoreFields draft={ffFormat} onChange={setFfFormat} />
            </FormCard>
          ) : null}
          <FormCard>
            <TextField
              label="Workout name"
              maxLength={120}
              onChangeText={setName}
              optional
              placeholder="Push day, Murph, morning run..."
              ref={nameRef}
              value={name}
              {...fieldChainProps({
                count: 2,
                index: 0,
                onAdvance: () => captionRef.current?.focus(),
              })}
            />
          </FormCard>
          <FormCard>
            <FieldLabel label="How'd it feel?" optional />
            <View style={styles.followField}>
              <FlameRating onChange={setEffort} value={effort} />
            </View>
          </FormCard>
          <FormCard>
            <PhotoTile
              error={photoError}
              label="Photo"
              onAdd={() => void pickPhoto()}
              onRemove={() => {
                setPhoto(null);
                setPhotoRemoved(true);
                setError(null);
              }}
              onRetry={photoError ? () => void submitWorkout() : undefined}
              optional
              uri={photoUri}
            />
            <View style={styles.captionField}>
              <TextArea label="Caption" maxLength={2_000} onChangeText={setCaption} optional placeholder="Legs felt great today" ref={captionRef} value={caption} />
            </View>
          </FormCard>
          <CompletedCard
            occurredAt={occurredAt}
            onOccurredAt={(value) => {
              const parts = getLocalDateParts(value);
              setOccurredAt(value);
              setWebDate(parts.date);
              setWebTime(parts.time);
            }}
            onPicker={(next) => {
              if (next.pickerMode) setPickerMode(next.pickerMode);
              setShowPicker(next.showPicker);
            }}
            onWebDate={setWebDate}
            onWebTime={setWebTime}
            pickerMode={pickerMode}
            showPicker={showPicker}
            webDate={webDate}
            webTime={webTime}
          />
        </>
      )}
      notice={error && !photoError ? <FormError message={error} /> : null}
      onClose={() => router.back()}
      toast={(
        <LastTimeUndoToast
          onClear={() => setUseUndo(null)}
          toast={useUndo}
        />
      )}
      preview={(
        <WorkoutSummaryCard
          variant="full"
          workout={previewWorkout({
            caption,
            displayName: "You",
            effort,
            groupId: groupId ?? "preview",
            name,
            occurredAt,
            photoUri,
            resultSummary: previewResultSummary(
              workoutType,
              runSubtype,
              results,
              intervals,
              ffFormat,
              ffExercises,
              exercises,
              loadUnit,
            ),
            workoutType,
            runSubtype,
          })}
        />
      )}
      scrollRef={scrollViewRef}
      submit={(
        <Button
          disabled={loadingExisting || Boolean(disabledReason)}
          disabledReason={disabledReason}
          loading={submitting || loadingExisting}
          loadingLabel={editing ? "Saving" : "Logging"}
          onPress={() => void submitWorkout()}
        >
          {editing ? "Save changes" : "Log workout"}
        </Button>
      )}
      title={editing ? "Update your rep-in" : "Track your workout"}
    />
  );
}

function previewResultSummary(
  workoutType: WorkoutType | null,
  runSubtype: RunWorkoutSubtype | null,
  results: QuickLogResultsDraft,
  intervals: IntervalDraft[],
  ffFormat: FunctionalFormatDraft,
  ffExercises: FfExerciseDraft[],
  exercises: DetailedExerciseDraft[],
  loadUnit: LoadUnit,
) {
  if (workoutType === "functional_fitness" && ffFormat.type) {
    return previewFunctionalFormatSummary(ffFormat, ffExercises);
  }
  if (workoutType === "run" && runSubtype) {
    const lines = buildRunResultSummary(runSubtype, results, intervals)
      .map((line) => line.trim())
      .filter((line) => line && line !== "No results added");
    return lines.join(" · ") || null;
  }
  if (workoutType === "strength_training" || workoutType === "powerlifting") {
    return previewStrengthSummary(exercises, loadUnit);
  }
  if (workoutType === "walk" || workoutType === "cycling") {
    return previewDistanceDurationSummary(results);
  }
  const parts: string[] = [];
  if (results.timeMinutes.trim() || results.timeSeconds.trim()) {
    const duration = previewDistanceDurationSummary({ ...results, distance: "" });
    if (duration) parts.push(duration);
  }
  if (workoutType === "functional_fitness" && results.functionalResultType === "rounds" && results.rounds.trim()) parts.push(`${results.rounds} rounds`);
  if (workoutType === "functional_fitness" && results.functionalResultType === "score" && results.score.trim()) parts.push(results.score.trim());
  return parts.join(" · ") || null;
}

function previewWorkout({
  caption,
  displayName,
  effort,
  groupId,
  name,
  occurredAt,
  photoUri,
  resultSummary,
  runSubtype,
  workoutType,
}: {
  caption: string;
  displayName: string;
  effort: number | null;
  groupId: string;
  name: string;
  occurredAt: Date;
  photoUri: string | null;
  resultSummary: string | null;
  runSubtype: RunWorkoutSubtype | null;
  workoutType: WorkoutType | null;
}): WorkoutFeedItem {
  const occurred = occurredAt.toISOString();
  const typeLabel = workoutType ? workoutTypeLabels[workoutType] : "Workout";
  const title = name.trim() || (workoutType === "run" && runSubtype ? runPreviewTitles[runSubtype] : typeLabel);
  return {
    caption: caption.trim() || null,
    completedAt: occurred,
    createdAt: occurred,
    displayName,
    durationMinutes: null,
    effort,
    groupId,
    id: "preview",
    name: title,
    notes: caption.trim() || null,
    occurredAt: occurred,
    photoPath: null,
    photoUrl: photoUri,
    resultSummary,
    title,
    updatedAt: occurred,
    userId: "me",
    workoutType: workoutType ?? "other",
  };
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const styles = StyleSheet.create({
  captionField: { marginTop: spacing.lg },
  followField: { marginTop: spacing.sm },
});
