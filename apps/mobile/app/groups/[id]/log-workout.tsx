import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { WorkoutType } from "@repin/types";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../../lib/supabase";
import { BackButton, Button, TextField } from "../../../ui/components";
import { colors, fonts, radii, spacing, type } from "../../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const workoutOptions: { label: string; value: WorkoutType }[] = [
  { label: "Run", value: "run" }, { label: "Walk", value: "walk" },
  { label: "Strength Training", value: "strength_training" }, { label: "Powerlifting", value: "powerlifting" },
  { label: "HIIT", value: "hiit" }, { label: "Functional Fitness", value: "functional_fitness" },
  { label: "Other", value: "other" },
];
const requiredDurationTypes = new Set<WorkoutType>(["run", "walk", "hiit"]);
const workoutTypeLabels = Object.fromEntries(workoutOptions.map((option) => [option.value, option.label])) as Record<WorkoutType, string>;
const effortLabels = ["Light work", "Felt good", "Solid work", "That was tough", "How am I alive?"];
type SelectedPhoto = { base64: string; mimeType: string; uri: string };

export default function LogWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [effort, setEffort] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [webDate, setWebDate] = useState(() => getLocalDateParts(new Date()).date);
  const [webTime, setWebTime] = useState(() => getLocalDateParts(new Date()).time);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationRequired = workoutType ? requiredDurationTypes.has(workoutType) : false;
  const parsedDuration = duration.trim() ? Number(duration) : null;
  const durationValid = parsedDuration === null || (Number.isInteger(parsedDuration) && parsedDuration > 0 && parsedDuration <= 1_440);
  const canSubmit = Boolean(workoutType) && durationValid && (!durationRequired || parsedDuration !== null);

  const pickPhoto = useCallback(async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("Allow photo library access to attach a workout photo."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, base64: true, mediaTypes: ["images"], quality: 0.85, selectionLimit: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) { setError("That photo could not be read. Try another image."); return; }
    setPhoto({ base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", uri: asset.uri });
  }, []);

  const submitWorkout = useCallback(async () => {
    setError(null);
    if (!workoutType) { setError("Choose a workout type."); return; }
    if (!durationValid || (durationRequired && parsedDuration === null)) {
      setError(durationRequired ? "Add a valid duration for this workout." : "Duration must be a positive whole number of minutes.");
      return;
    }
    if (!supabase || !groupId) { setError("This workout cannot be submitted from the current screen."); return; }
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
      const response = await fetch(`${apiUrl}/api/groups/${encodeURIComponent(groupId)}/workouts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType,
          name,
          durationMinutes: parsedDuration,
          effort,
          caption,
          photoPath: uploadedPhotoPath,
          occurredAt: occurredAt.toISOString(),
          // Keep aliases during the v1 rollout so an older API deployment can validate the request.
          title: name.trim() || workoutTypeLabels[workoutType],
          notes: caption,
          completedAt: occurredAt.toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json()) as { error?: string; issues?: { message: string; path?: PropertyKey[] }[] };
      if (!response.ok) {
        const validationMessage = body.issues?.map((issue) => `${issue.path?.join(".") || "workout"}: ${issue.message}`).join("; ");
        if (__DEV__ && body.issues?.length) console.warn("Workout validation failed", body.issues);
        throw new Error(validationMessage || body.error || "Workout could not be created.");
      }
      router.back();
    } catch (submitError) {
      if (uploadedPhotoPath && supabase) await supabase.storage.from("workout-photos").remove([uploadedPhotoPath]);
      setError(submitError instanceof Error ? submitError.message : "Workout could not be created.");
      setSubmitting(false);
    }
  }, [caption, durationRequired, durationValid, effort, groupId, name, occurredAt, parsedDuration, photo, router, workoutType]);

  const handleNativeDateChange = useCallback((event: DateTimePickerEvent, value?: Date) => {
    if (event.type === "dismissed" || !value) { setShowPicker(false); return; }
    setOccurredAt(value);
    if (Platform.OS === "android" && pickerMode === "date") {
      setShowPicker(false); setPickerMode("time"); requestAnimationFrame(() => setShowPicker(true)); return;
    }
    if (Platform.OS === "android") setShowPicker(false);
  }, [pickerMode]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.container} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.scrollView}>
          <BackButton label="Cancel" onPress={() => router.back()} />
          <Text style={styles.eyebrow}>QUICK CHECK-IN</Text><Text style={styles.title}>Log a workout</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What&apos;d you do?</Text>
            <View style={styles.typeGrid}>{workoutOptions.map((option) => (
              <Pressable accessibilityRole="button" key={option.value} onPress={() => setWorkoutType(option.value)} style={({ pressed }) => [styles.typeChip, workoutType === option.value && styles.typeChipSelected, pressed && styles.pressed]}>
                <Text style={[styles.typeChipText, workoutType === option.value && styles.typeChipTextSelected]}>{option.label}</Text>
              </Pressable>
            ))}</View>
          </View>

          <View style={styles.section}><FieldLabel label="Give it a name" optional /><TextField maxLength={120} onChangeText={setName} placeholder="Push day, morning run..." value={name} /></View>
          <View style={styles.section}>
            <FieldLabel label="How long?" optional={!durationRequired} />
            <View><TextField inputMode="numeric" maxLength={4} onChangeText={setDuration} placeholder="45" style={styles.durationInput} value={duration} /><Text pointerEvents="none" style={styles.durationSuffix}>min</Text></View>
            {!durationValid ? <Text style={styles.inlineError}>Enter a positive whole number of minutes.</Text> : null}
          </View>
          <View style={styles.section}>
            <FieldLabel label="How'd it feel?" optional />
            <View style={styles.effortRow}>{[1, 2, 3, 4, 5].map((level) => (
              <Pressable accessibilityLabel={`${level}: ${effortLabels[level - 1]}`} accessibilityRole="button" key={level} onPress={() => setEffort(level)} style={styles.flameButton}><Text style={[styles.flame, (effort ?? 0) < level && styles.flameInactive]}>🔥</Text></Pressable>
            ))}</View>
            {effort ? <Text style={styles.effortLabel}>{effortLabels[effort - 1]}</Text> : null}
          </View>
          <View style={styles.section}><FieldLabel label="How'd it go?" optional /><TextField maxLength={2_000} multiline onChangeText={setCaption} placeholder="Knee felt a lot better today..." style={styles.captionInput} value={caption} /></View>

          <View style={styles.section}>
            <FieldLabel label="Photo" optional />
            {photo ? <View><Image accessibilityLabel="Selected workout" source={{ uri: photo.uri }} style={styles.photoPreview} /><View style={styles.photoActions}><Pressable accessibilityRole="button" onPress={() => void pickPhoto()}><Text style={styles.textAction}>Change</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPhoto(null)}><Text style={styles.removeAction}>Remove</Text></Pressable></View></View> :
              <Pressable accessibilityRole="button" onPress={() => void pickPhoto()} style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed]}><Text style={styles.addPhotoText}>+ Add photo</Text></Pressable>}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>When?</Text>
            {Platform.OS === "web" ? <View style={styles.webDateRow}>
              <View style={styles.webDateField}><TextField autoCapitalize="none" label="Date" onBlur={() => setOccurredAt(fromLocalParts(webDate, webTime, occurredAt))} onChangeText={setWebDate} placeholder="YYYY-MM-DD" value={webDate} /></View>
              <View style={styles.webDateField}><TextField autoCapitalize="none" label="Time" onBlur={() => setOccurredAt(fromLocalParts(webDate, webTime, occurredAt))} onChangeText={setWebTime} placeholder="HH:MM" value={webTime} /></View>
            </View> : <>
              <Pressable accessibilityRole="button" onPress={() => { setPickerMode("date"); setShowPicker(true); }} style={({ pressed }) => [styles.whenRow, pressed && styles.pressed]}><Text style={styles.whenText}>{formatFriendlyDate(occurredAt)}</Text><Text style={styles.whenAction}>Edit</Text></Pressable>
              {showPicker ? <View style={styles.pickerWrap}><DateTimePicker mode={Platform.OS === "ios" ? "datetime" : pickerMode} onChange={handleNativeDateChange} value={occurredAt} />{Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => setShowPicker(false)}><Text style={styles.pickerDone}>Done</Text></Pressable> : null}</View> : null}
            </>}
          </View>
          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
          <Button disabled={!canSubmit} loading={submitting} onPress={() => void submitWorkout()} style={styles.submitButton}>Log workout</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return <View style={styles.labelRow}><Text style={styles.sectionTitle}>{label}</Text>{optional ? <Text style={styles.optional}>Optional</Text> : null}</View>;
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
  safeArea: { backgroundColor: colors.background, flex: 1 }, keyboardAvoidingView: { flex: 1 }, scrollView: { flex: 1 }, container: { padding: spacing.xxl, paddingBottom: 120 },
  eyebrow: { color: colors.brand, ...type.eyebrow }, title: { color: colors.ink, ...type.display, marginTop: spacing.xs }, section: { marginTop: spacing.xxl }, sectionTitle: { color: colors.ink, ...type.heading },
  labelRow: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm }, optional: { color: colors.muted, ...type.label },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }, typeChip: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md, width: "48%" }, typeChipSelected: { backgroundColor: colors.brand }, typeChipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14, textAlign: "center" }, typeChipTextSelected: { color: colors.surface }, pressed: { opacity: 0.76 },
  durationInput: { paddingRight: 52 }, durationSuffix: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14, position: "absolute", right: spacing.lg, top: 16 }, inlineError: { color: colors.danger, ...type.bodySmall, marginTop: spacing.xs },
  effortRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }, flameButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 }, flame: { fontSize: 25 }, flameInactive: { opacity: 0.2 }, effortLabel: { color: colors.muted, ...type.bodySmall, marginTop: spacing.xs }, captionInput: { minHeight: 96, textAlignVertical: "top" },
  addPhoto: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, justifyContent: "center", marginTop: spacing.sm, minHeight: 44, paddingHorizontal: spacing.lg }, addPhotoText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: 14 }, photoPreview: { aspectRatio: 4 / 3, borderRadius: radii.md, marginTop: spacing.sm, width: "100%" }, photoActions: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }, textAction: { color: colors.brand, ...type.label }, removeAction: { color: colors.muted, ...type.label },
  whenRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52 }, whenText: { color: colors.inkSoft, ...type.bodyMedium }, whenAction: { color: colors.brand, ...type.label }, pickerWrap: { alignItems: "flex-end", marginTop: spacing.sm }, pickerDone: { color: colors.brand, ...type.label, padding: spacing.md }, webDateRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }, webDateField: { flex: 1 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, marginTop: spacing.xl, padding: spacing.md }, errorText: { color: colors.danger, ...type.bodySmall }, submitButton: { marginTop: spacing.xl },
});
