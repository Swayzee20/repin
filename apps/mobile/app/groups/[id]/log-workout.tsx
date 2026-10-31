import type { WorkoutFeedItem, WorkoutType } from "@repin/types";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, type ComponentRef } from "react";
import { View, type TextInput } from "react-native";

import { supabase } from "../../../lib/supabase";
import { markWorkoutDataStale } from "../../../lib/data-freshness";
import { isLayoutPreview } from "../../../lib/layout-preview";
import { Button, WorkoutSummaryCard } from "../../../ui/components";
import { FieldLabel, FlameRating, PhotoTile, TextArea, photoUploadFieldError } from "../../../ui/form-fields";
import { useLayoutMode } from "../../../ui/layout";
import { ScrollAnchor, useScrollAnchor, writeStoredScrollAnchor } from "../../../ui/scroll-anchor";
import { spacing } from "../../../ui/theme";
import { WorkoutTypeGrid, workoutTypeLabels } from "../../../ui/workout-type-selector";
import {
  CardHeading,
  CompletedCard,
  FormCard,
  FormError,
  WorkoutFormScaffold,
  getLocalDateParts,
} from "../../../ui/workout-form-frame";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
  const occurredAt = new Date(form.occurredAt);
  const canSubmit = Boolean(form.workoutType);
  const photoError = photoUploadFieldError(form.error);

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

  return (
    <WorkoutFormScaffold
      anchor={postAnchor}
      eyebrow="QUICK CHECK-IN"
      fields={(
        <>
          <FormCard>
            <CardHeading>What&apos;d you do?</CardHeading>
            <WorkoutTypeGrid onChange={(workoutType) => dispatch({ type: "type", workoutType })} value={form.workoutType} />
          </FormCard>
          <FormCard>
            <FieldLabel label="How'd it feel?" optional />
            <View style={{ marginTop: spacing.sm }}>
              <FlameRating onChange={(effort) => dispatch({ effort, type: "effort" })} value={form.effort} />
            </View>
          </FormCard>
          <CompletedCard
            occurredAt={occurredAt}
            onOccurredAt={(value) => dispatch({ occurredAt: value.toISOString(), type: "occurred" })}
            onPicker={(next) => dispatch({ pickerMode: next.pickerMode, showPicker: next.showPicker, type: "picker" })}
            onWebDate={(webDate) => dispatch({ type: "web-date", webDate })}
            onWebTime={(webTime) => dispatch({ type: "web-time", webTime })}
            pickerMode={form.pickerMode}
            showPicker={form.showPicker}
            webDate={form.webDate}
            webTime={form.webTime}
          />
          <FormCard>
            <PhotoTile
              busy={form.photoStatus === "picking" || form.photoStatus === "uploading"}
              error={photoError}
              label="Photo"
              onAdd={() => void pickPhoto()}
              onRemove={() => {
                dispatch({ photo: null, type: "photo" });
                dispatch({ error: null, type: "error" });
              }}
              onRetry={photoError ? () => void submitWorkout() : undefined}
              optional
              uri={form.photo?.uri}
            />
            <View style={{ marginTop: spacing.lg }}>
              <ScrollAnchor id="log-caption">
                <TextArea
                  accessibilityLabel="Caption"
                  label="Caption"
                  maxLength={2_000}
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
                  optional
                  placeholder="Legs felt great today"
                  ref={captionRef}
                  value={form.caption}
                />
              </ScrollAnchor>
            </View>
          </FormCard>
        </>
      )}
      notice={form.error && !photoError ? <FormError message={form.error} /> : null}
      onClose={() => router.back()}
      preview={(
        <WorkoutSummaryCard
          variant="full"
          workout={previewWorkout(form, layoutPreview ? "Maya L." : "You", groupId ?? "preview")}
        />
      )}
      submit={(
        <Button
          disabled={!canSubmit}
          disabledReason={canSubmit ? undefined : "Choose a workout type."}
          loading={form.submitting}
          loadingLabel="Logging"
          onPress={() => void submitWorkout()}
        >
          Log workout
        </Button>
      )}
      title="Log a workout"
    />
  );
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

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
